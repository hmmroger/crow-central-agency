# Crow Central Agency (CCA) - Project Specification

## Overview

Crow Central Agency is a multi-instance Claude Code orchestrator. It provides a web-based control plane for creating, managing, and coordinating multiple autonomous Claude Code agents - each with its own identity, workspace, permissions, and persistent memory.

The system follows a client-server architecture where the backend is the single source of truth for all state, computation, and AI interaction. The frontend is a stateless presentation layer that renders what the backend provides. Agents communicate with each other through standardized MCP tools, enabling collaborative workflows where one agent can delegate tasks to another and consume results through shared artifacts.

## Core Domain Concepts

### Agent

An agent is a **unique persistent identity**, not a template or factory. Each agent has exactly one configuration and may work on one particular session at any time. There is a 1:1 relationship between an agent config and an agent instance - one config never spawns multiple instances.

An agent is defined by:
- **Identity**: UUID, name, description
- **Workspace**: A folder on disk where the agent operates (its `cwd`)
- **Persona**: System-level instructions that shape behavior
- **AGENT.md**: Persistent markdown instructions loaded into each session's system prompt
- **Model**: The Claude model to use (default: `claude-sonnet-4-6`)
- **Tools & Permissions**: Which tools are available, which are auto-approved, and the permission escalation mode
- **Setting Sources**: Which Claude settings sources to load (`user`, `project`, `local`)
- **Loop**: Optional automation config - send a prompt on a recurring interval
- **System flag**: Built-in system agents (e.g. "Crow") are immutable and not persisted to disk

### Artifact

A file in an agent's `artifacts/` directory. Artifacts are the primary mechanism for agent output and inter-agent data exchange.

- Each agent can write only to its own artifacts folder
- Any agent can read from any other agent's artifacts
- Artifacts are exposed to agents via MCP tools (`write_artifact`, `read_artifact`, `list_artifacts`)

### Session

A conversation between a user (or the system) and a single agent, managed by the Claude Agent SDK. Sessions are persisted to disk by the SDK and can be resumed across server restarts. Each agent works on one session at a time, and the session ID is captured from the agent stream during initialization.

### Task

A unit of work assigned to an agent. Tasks can originate from a user or from another agent (via `invoke_agent`). They have a lifecycle: `OPEN` -> `ACTIVE` -> `COMPLETED`/`INCOMPLETE` -> `CLOSED`. Tasks are persisted to `agent-tasks.json` and scheduled by the orchestrator when the target agent becomes idle.

### AgentStreamEvent

The abstraction boundary between agent execution and orchestration. `AgentRunner` produces a typed stream of `AgentStreamEvent`s via async generator. The orchestrator consumes these events without knowledge of the underlying AI SDK or how the agent executes. This interface allows future replacement of the agent backend without changing orchestration logic.

Event types: `INIT`, `CONTENT`, `THINKING`, `TOOL_USE`, `TOOL_USE_PROGRESS`, `MESSAGE_DONE`, `STATUS`, `DONE`, `ERROR`, `ABORTED`, `RATE_LIMIT_INFO`.

### Orchestrator

The central state machine that owns the lifecycle of all agent runtimes. It manages message routing and queuing, consumes `AgentStreamEvent`s from runners, broadcasts WebSocket messages to clients, persists state, and schedules tasks. The orchestrator does not know how agents execute - that responsibility belongs to `AgentRunner`.

## Architecture

### Package Structure

```
crow-central-agency/
  packages/
    backend/     @crow-central-agency/backend
    frontend/    @crow-central-agency/frontend
    shared/      @crow-central-agency/shared
```

No runtime dependency exists between the two packages. They communicate exclusively over HTTP (REST) and WebSocket.

### Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js (ESM) |
| Backend framework | Fastify 5 |
| Real-time | WebSocket (`@fastify/websocket` + `ws`) |
| AI integration | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| Validation | Zod v4 |
| Frontend framework | React 19 |
| State management | Zustand (app state, persisted to localStorage) |
| Server state | TanStack React Query (REST caching) |
| Styling | Tailwind CSS 4 |
| Animation | Framer Motion |
| Icons | Lucide React |
| Markdown rendering | Marked + DOMPurify |
| Bundler | Vite 8 |
| Type checking | TypeScript 5.9 (strict) |
| Linting | ESLint with TypeScript, React Hooks, and import plugins |
| Content generation | OpenAI-compatible API (optional, for persona/AGENT.md generation) |

### Backend Architecture

#### Service Layer

Each responsibility is encapsulated in a standalone service. Services communicate via constructor injection and an event bus - no global singletons.

| Service | Responsibility |
|---|---|
| **AgentOrchestrator** | Central state machine. Manages message routing/queuing, consumes `AgentStreamEvent`s from runners, maps events to WebSocket broadcasts, persists runtime state, schedules tasks when agents become idle. Reacts to `AgentTaskManager` events for task notifications. |
| **AgentRunner** | Per-agent abstraction for agent execution. Wraps the Claude Agent SDK `query()` behind the `AgentStreamEvent` async generator interface. Builds system prompts, configures tools/MCP/permissions, processes SDK streams into typed events. Emits `agentStatusChanged` events. The orchestrator is decoupled from the SDK through this boundary. |
| **AgentRegistry** | CRUD for agent configs. Validates with Zod schemas. Persists to `agents.json`. Manages agent folders (AGENT.md + artifacts). Extends `EventBus<AgentRegistryEvents>`. |
| **SessionManager** | Loads session messages from SDK backend storage. Transforms raw SDK messages to UI-friendly `AgentMessage` format. Caches with invalidation support. |
| **ArtifactManager** | CRUD for agent artifacts under `agents/{id}/artifacts/`. Path traversal protection on all operations. |
| **WsBroadcaster** | Maintains set of connected WebSocket clients. Provides `broadcast(message)` and `sendTo(ws, message)`. No per-agent subscription filtering - all clients receive all messages. |
| **PermissionHandler** | Manages tool permission requests with a 2-minute timeout. Resolves via WebSocket responses from the UI. |
| **MessageQueueManager** | In-memory queue for messages sent while an agent is busy. Processed when agent becomes idle. Cleared on new session. |
| **AgentTaskManager** | Persistence and event layer for tasks (`agent-tasks.json`). Stores tasks, validates state transitions (OPEN -> ACTIVE -> COMPLETED/INCOMPLETE -> CLOSED), and emits lifecycle events. Does not make scheduling or assignment decisions - callers (MCP servers, orchestrator) drive those. Serialized read-modify-write via promise chain. Extends `EventBus<AgentTaskManagerEvents>`. |
| **LoopScheduler** | Scheduled prompt delivery. Two time modes: `AT` (specific wall-clock time) and `EVERY` (recurring interval). Creates loop tasks via `AgentTaskManager`. |
| **CrowMcpManager** | Registry for MCP server factories. Maps server name -> factory function. Generates tool prefixes: `mcp__{serverName}__`. |
| **MdGenerationService** | Generates personas and AGENT.md content via an OpenAI-compatible API. Optional - requires `OPENAI_API_KEY` config. |

#### Stream Processing Pipeline

When a user sends a message to an agent:

1. **Orchestrator** validates the agent is idle (or enqueues via `MessageQueueManager`)
2. **AgentRunner.sendMessage()** is called, which returns an async generator of `AgentStreamEvent`s
3. Inside the runner: system prompt is assembled, SDK query is created with model/tools/permissions/MCP, and the SDK stream is transformed into `AgentStreamEvent`s via `processStream()`
4. **Orchestrator** iterates the event stream and maps each event to actions:
   - `INIT` -> captures session ID, broadcasts user message, discovers tools, persists state
   - `CONTENT` -> broadcasts `agent_text` (streamed text delta)
   - `TOOL_USE` -> broadcasts `agent_activity` (tool name + description)
   - `TOOL_USE_PROGRESS` -> broadcasts `agent_tool_progress` (elapsed time)
   - `MESSAGE_DONE` -> adds to session manager, broadcasts `agent_message` (complete message)
   - `STATUS` -> broadcasts `agent_status` (e.g. compacting)
   - `DONE` -> broadcasts `agent_result` + `agent_usage`, accumulates session usage
   - `ERROR` / `ABORTED` -> broadcasts error, marks task incomplete if applicable
5. **On completion**: runner transitions to idle, orchestrator persists state, drains message queue, schedules next task

#### System MCP Servers
 - `crow-artifacts` MCP server providing tools for agents to access artifacts (`write_artifact`, `read_artifact`, `list_artifacts`)
 - `crow-agents` MCP server providing tools for inter-agent communication (`list_agents`, `invoke_agent`)

#### Inter-Agent Communication

Agents discover and invoke each other through MCP tools. The MCP server is the actor that creates and assigns tasks; `AgentTaskManager` is a persistence and event layer. The orchestrator reacts to task lifecycle events rather than directly coordinating invocations:

1. Agent A calls `invoke_agent(targetId, task)` via the `crow-agents` MCP server
2. The MCP server creates a task via `taskManager.addTask()` with originate source `AGENT` (Agent A)
3. The MCP server immediately assigns it via `taskManager.assignTask()` to Agent B, with dispatch source pointing to Agent A
4. `AgentTaskManager` persists and emits `taskAssigned`
5. The orchestrator reacts to `taskAssigned` by scheduling the task when Agent B becomes idle
6. Agent B works on the task and writes results to its artifacts folder
7. When Agent B finishes, the orchestrator updates the task to `COMPLETED`/`INCOMPLETE`
8. `AgentTaskManager` emits `taskStateChanged`; the orchestrator reacts by notifying Agent A with available artifacts
9. Agent A reads the results via `read_artifact(agentId, filename)`

This is an async, event-driven pattern - there is no synchronous return value or direct callback.

#### Permission Flow

When a tool requires user approval:

1. SDK calls the `canUseTool` hook on the `AgentRunner`
2. The runner delegates to a `PermissionRequestCallback` provided by the orchestrator
3. `PermissionHandler` creates a pending request with a 2-minute timeout
4. A `permission_request` message is broadcast to all connected WebSocket clients
5. The UI displays an approval prompt in the `PermissionQueue`
6. User clicks allow/deny -> client sends `permission_response` over WebSocket
7. `PermissionHandler` resolves the pending promise -> SDK proceeds or skips

### Frontend Architecture

#### Provider Stack

The app root composes providers in this order:
1. `ErrorBoundary` - catches React errors, displays fallback UI
2. `QueryClientProvider` - TanStack React Query for REST data caching
3. `WsProvider` - WebSocket connection context
4. `ContextMenuProvider` - portal-rendered context menus
5. `ModalDialogProvider` - portal-rendered modal dialogs
6. `HeaderProvider` - dynamic page header content

#### App Layout

The layout shell consists of:
- **AppHeader** - spans full width at top
- **ReconnectBanner** - shown when WebSocket disconnects
- **AppSidebar** - left navigation, controls view mode + agent list
- **Main content** - renders the active view
- **SidePanel** - right resizable panel (only shown in Agents view)

#### Navigation & Views

Navigation is flat (no history stack), controlled by `viewMode` in the Zustand app store:

| View Mode | Component | Description |
|---|---|---|
| `DASHBOARD` | `Dashboard` | Grid of agent cards with status, usage, and quick actions. "New Agent" button opens editor. |
| `AGENTS` | `AgentsView` | Left: `AgentCommandStrip` (agent list + selection). Right: `AgentConsole` (messages, input, permissions). |
| `AGENT_EDITOR` | `AgentEditorView` | Full-page form for creating/editing agents. Returns to dashboard on save/cancel. |

The Agents view side panel has tabs:
- **Status** - agent status indicator, session metrics (cost, context usage), session controls (compact, new conversation)
- **Artifacts** - browse and view agent artifact files

#### WebSocket Client

- Connects to `/ws` with automatic protocol detection (ws/wss)
- Exponential backoff reconnect (1s -> 30s cap)
- No subscription management - receives all server messages, client-side hooks filter by `agentId`
- Connection states: `DISCONNECTED`, `CONNECTING`, `RECONNECTING`, `CONNECTED`

#### Data Fetching Patterns

**React Query** (REST data):
- `useAgentsQuery()` - list all agents
- `useAgentQuery(agentId)` - single agent + AGENT.md
- `useAgentMessagesQuery(agentId)` - session messages
- `useAgentStateQuery(agentId)` - runtime state (status, usage, pending permissions)
- `useAgentArtifactsQuery(agentId)` - list artifacts
- `useArtifactContentQuery(agentId, filename)` - read artifact content

**WebSocket** (real-time ephemeral state via `useAgentStreamState`):
- `streamingText` - text being typed in real-time (accumulated `agent_text` deltas)
- `activeToolUse` - current tool name + elapsed time
- `lastResult` - query completion info (cost, duration)

**Action hooks** (`useAgentActions`):
- `sendMessage` / `injectMessage` - send via WebSocket
- `abortAgent` - stop agent via REST
- `compact` / `newSession` - session management via REST
- `respondToPermission` - permission decisions via WebSocket

#### State Management

| Store | Scope | Persistence |
|---|---|---|
| **App Store** (Zustand) | View mode, selected agent, editor agent, side panel state | localStorage |
| **React Query cache** | Agent list, agent details, messages, runtime state, artifacts | In-memory |
| **Stream state** (hook-local) | Streaming text, active tool, last result | None (ephemeral) |

#### Design System

Theme defined using Tailwind CSS v4 `@theme` block and layers. All visual properties use theme tokens - no hardcoded pixel sizes or raw color values.

- **Base colors**: Deep obsidian with violet undertone
- **Accent**: Electric blue
- **Overall feel**: Dark theme with deep dark base, matte midnight plum with soft-touch texture. Deep muted tones, diffused glows, translucent layered panels. Subtle sage/teal bloom effects on matte surfaces.

Basic tokens include: base, surface (surface, surface-elevated, surface-inset), primary, secondary, accent, border (border, border-subtle), text (text-primary, text-secondary, text-muted), success, info, error, warning.

### Communication Protocol

#### REST API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/:id` | Get agent config + AGENT.md |
| `POST` | `/api/agents` | Create agent |
| `PATCH` | `/api/agents/:id` | Update agent |
| `DELETE` | `/api/agents/:id` | Delete agent |
| `POST` | `/api/agents/:id/send` | Send message (fire-and-forget, result via WS) |
| `POST` | `/api/agents/:id/stop` | Stop an active agent |
| `GET` | `/api/agents/:id/messages` | Get session messages |
| `GET` | `/api/agents/:id/sessions` | List sessions for an agent |
| `POST` | `/api/agents/:id/session/new` | Start a new session |
| `POST` | `/api/agents/:id/session/compact` | Trigger manual compaction (fire-and-forget) |
| `GET` | `/api/agents/:id/state` | Get runtime state (status, usage, pending permissions) |
| `GET` | `/api/agents/:id/artifacts` | List agent artifacts |
| `GET` | `/api/agents/:id/artifacts/:filename` | Read artifact content |
| `POST` | `/api/generate/persona` | Generate persona (optional, requires OpenAI config) |
| `POST` | `/api/generate/agent-md` | Generate AGENT.md (optional, requires OpenAI config) |

#### WebSocket Messages

**Client -> Server:**

| Type | Purpose |
|---|---|
| `send_message` | Send a user message to an agent |
| `inject_message` | Inject a message into an active stream |
| `permission_response` | Approve or deny a tool permission request (with optional message) |

**Server -> Client:**

| Type | Purpose |
|---|---|
| `agent_text` | Streamed response text delta |
| `agent_message` | Complete assistant message (committed to session history) |
| `agent_activity` | Tool use started (tool name + human-readable description) |
| `agent_tool_progress` | Tool execution elapsed time |
| `agent_result` | Query completion (success/error, cost, duration) |
| `agent_status` | Runtime state change (idle, streaming, compacting) |
| `agent_updated` | Agent config changed |
| `agent_usage` | Token count and cost update |
| `permission_request` | Prompt user to approve/deny a tool |
| `permission_cancelled` | Permission request timed out |
| `error` | Transport or processing error |

### Data Persistence

#### Files (under `CROW_SYSTEM_PATH`)

| File | Contents |
|---|---|
| `agents.json` | All user-created agent configs (excludes system agents) |
| `agent-tasks.json` | All tasks with state lifecycle |
| `orchestrator-state.json` | Runtime states per agent (sessionId, usage, pending permissions) |
| `agents/{id}/AGENT.md` | Agent-specific system prompt extension |
| `agents/{id}/artifacts/{filename}` | Agent output files |

### Build and Deployment

```bash
npm run dev       # parallel: shared watch + backend tsc watch + frontend vite dev (port 5101)
npm run build     # shared -> backend tsc -> frontend vite build -> copy to backend/dist/public
npm start         # node dist/cli.js fullstack (serves API + SPA from single port)
```

The CLI supports two modes:
- `crow server` - API + WebSocket only (frontend served separately)
- `crow fullstack` - API + WebSocket + bundled SPA with fallback routing

### Configuration

Environment variables with sensible defaults:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `localhost` | Server bind address |
| `PORT` | `3030` | Server port |
| `CORS_ORIGINS` | `http://localhost:5101` | Allowed origins (comma-separated) |
| `CROW_SYSTEM_PATH` | `.crow` | Storage root directory |
| `STATIC_PATH` | `dist/public` | Frontend assets path |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Logging verbosity |
| `CLAUDE_CLI_PATH` | - | Path to Claude CLI executable |
| `OPENAI_BASE_URL` | - | OpenAI-compatible API for content generation |
| `OPENAI_API_KEY` | - | API key for generation endpoint |
| `OPENAI_MODEL` | - | Model name for generation |

## Design Principles

 - Backend is the source of truth: The frontend renders what the backend provides. No derived state, no duplicated logic on the client.
 - Agents are identities, not templates: Each agent config maps to exactly one agent instance. Never design patterns where one config spawns multiple instances.
 - Agent execution is abstracted: The orchestrator consumes `AgentStreamEvent`s without knowledge of the underlying AI SDK. `AgentRunner` owns the SDK interaction and exposes a typed async generator interface, allowing future replacement of the agent backend.
 - Event-driven coordination: Loose coupling through `EventBus`. Agent deletion triggers cleanup in the registry, orchestrator, and loop scheduler independently. Inter-agent task lifecycle flows through `AgentTaskManager` events.
 - Stream-first communication: Real-time data flows over WebSocket. REST is for queries and one-shot mutations. The UI never polls.
 - Broadcast WebSocket model: Server broadcasts all messages to all connected clients. Client-side hooks filter by `agentId`. No server-side subscription management.
 - MCP for agent collaboration: Agents interact through standardized MCP tools, not ad-hoc APIs. This keeps the agent-to-agent protocol discoverable and tool-native.
 - Design tokens over hardcoded values: All visual properties use theme tokens from the Tailwind `@theme` block. No raw pixel values or color codes in components.
 - Optional features (OpenAI generation, loop automation) are conditionally initialized. The core system works without them.
 - MUST NOT use variant design pattern for UI component like variant="primary" size="md".
 - AppError MUST NOT contain http status, services throwing error should not be concerned about http. This is our CCA internal error class. What status code to return is a route concern.
