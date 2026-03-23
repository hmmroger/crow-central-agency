# Crow Central Agency (CCA) — Project Specification

## Overview

Crow Central Agency is a multi-instance Claude Code orchestrator. It provides a web-based control plane for creating, managing, and coordinating multiple autonomous Claude Code agents — each with its own identity, workspace, permissions, and persistent memory.

The system follows a client-server architecture where the backend is the single source of truth for all state, computation, and AI interaction. The frontend is a stateless presentation layer that renders what the backend provides. Agents communicate with each other through standardized MCP tools, enabling collaborative workflows where one agent can delegate tasks to another and consume results through shared artifacts.

## Core Domain Concepts

### Agent

An agent is a **unique persistent identity**, not a template or factory. Each agent has exactly one configuration and may work on one particular session at any time. There is a 1:1 relationship between an agent config and an agent instance — one config never spawns multiple instances.

An agent is defined by:
- **Identity**: UUID, name, description
- **Workspace**: A folder on disk where the agent operates (its `cwd`)
- **Persona**: System-level instructions that shape behavior
- **AGENT.md**: Persistent markdown instructions loaded into each session's system prompt
- **Model**: The Claude model to use (default: `claude-sonnet-4-6`)
- **Tools & Permissions**: Which tools are available, which are auto-approved, and the permission escalation mode
- **Loop**: Optional automation config — send a prompt on a recurring interval

### Artifact

A file in an agent's `artifacts/` directory. Artifacts are the primary mechanism for agent output and inter-agent data exchange.

- Each agent can write only to its own artifacts folder
- Any agent can read from any other agent's artifacts
- Artifacts are exposed to agents via MCP tools (`write_artifact`, `read_artifact`, `list_artifacts`)

### Session

A conversation between a user (or the system) and a single agent, managed by the Claude Agent SDK. Sessions are persisted to disk by the SDK and can be resumed across server restarts. Each agent work on one session at a time, and is captured from Claude Agent SDK message during streaming, orchestrator captured the ID and track it with `sessionId` in runtime state.

### Orchestrator

The central state machine that owns the lifecycle of all agent runtimes: creating queries, processing streams, coordinating inter-agent invocations, persisting state, and broadcasting events to connected clients.

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
| Real-time | WebSocket (`ws`) |
| AI integration | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| Validation | Zod v4 |
| Frontend framework | React 19 |
| State management | Zustand |
| Styling | Tailwind CSS 4 |
| Bundler | Vite 8 |
| Type checking | TypeScript 5.9 (strict) |
| Linting | ESLint with TypeScript, React Hooks, and import plugins |
| Content generation | OpenAI-compatible API (optional, for persona/AGENT.md generation) |

### Backend Architecture

#### Service Layer

Each responsibility is encapsulated in a standalone service. Services communicate via constructor injection and an event bus — no global singletons.

| Service | Responsibility |
|---|---|
| **AgentOrchestrator** | Central state machine. Owns runtimes, processes SDK streams, coordinates inter-agent invocation, persists state. Extends `EventBus<OrchestratorEvents>`. |
| **AgentRegistry** | CRUD for agent configs. Validates with Zod schemas. Extends `EventBus<AgentRegistryEvents>`. |
| **SessionManager** | In-memory message store keyed by session ID. Main interface to Agent SDK to look up sessions, load history, etc. |
| **ArtifactManager** | Provide CRUD for agent artifacts. Abstract away from the actual data source/sink. |
| **WsBroadcaster** | Pub/sub layer. Maps `agentId → Set<WebSocket>`. Provides `broadcast(agentId, message)` and `sendTo(ws, message)`. |
| **PermissionHandler** | Manages tool permission requests with a configurable timeout. Resolves via WebSocket responses from the UI. |
| **LoopScheduler** | Scheduled prompt delivery. Emits `loopTick` events consumed by the orchestrator. |
| **MdGenerationService** | Generates personas and AGENT.md content via an OpenAI-compatible API. Optional — requires `OPENAI_BASE_URL` config. |

#### Stream Processing Pipeline

When a user sends a message to an agent:

1. **Orchestrator** validates the agent is not busy, creates/resumes a runtime
2. **System prompt** is assembled: persona + agent context (peer list) + AGENT.md
3. **SDK query** is created with the agent's model, tools, permissions, MCP servers
4. **Stream iteration** processes SDK events:
   - `content_block_delta` → `AgentTextMessage` (streamed to UI in real-time)
   - Tool use events → `AgentActivityMessage` (human-readable descriptions)
   - Usage events → `AgentUsageMessage` (token counts, cost)
   - `system.init` → captures available tools, updates registry
5. **Text coalescing**: consecutive text deltas are buffered and flushed as a single message on the next non-text event or stream end
6. **On completion**: runtime transitions to idle, state is persisted, `agentIdle` event fires

#### System MCP servers
 - `crow-agents` MCP server providing tool for invoke each other
 - `crow-artifacts` MCP server providing tools for agent to access artifacts

#### Inter-Agent Communication

Agents discover and invoke each other through MCP tools, not direct API calls:

1. Agent A calls `invoke_agent(targetId, task)` via the `crow-agents` MCP server
2. The orchestrator sends the task as a message to Agent B (or injects it if B is already streaming)
3. Agent B works on the task and writes results to its artifacts folder
4. When Agent B goes idle, the orchestrator notifies Agent A with a list of available artifacts
5. Agent A reads the results via `read_artifact(agentId, filename)`

This is an async pattern — there is no synchronous return value or direct callback.

#### Permission Flow

When a tool requires user approval:

1. SDK calls `canUseTool()` hook on the orchestrator
2. `PermissionHandler` creates a pending request with a 2-minute timeout
3. A `permission_request` message is broadcast to subscribed WebSocket clients
4. The UI displays an approval prompt
5. User clicks allow/deny → client sends `permission_response` over WebSocket
6. `PermissionHandler` resolves the pending promise → SDK proceeds or skips

### Frontend Architecture

#### WebSocket Client

- Connects to `/ws` with automatic protocol detection (ws/wss)
- Exponential backoff reconnect (1s → 30s cap)
- Maintains subscription set across reconnects
- Global message handler registry for routing server messages to stores

#### Design System

Design a theme defined using latest TailwindCSS v4 `@theme` and layers. Reference the latest documentation on best practices on v4 system.:
Basic tokens should at least include: base, surface, primary, secondary, accent, border, text (text-primary, text-secondary, text-muted), success, info, error, warning.
I have pre-selected the typography.

The overall visual is a dark theme with deep dark base background, matte midnight plum with a soft-touch texture. The overall should give deep muted tones and diffused glows. The interface should feel translucent, layered, and sophisticated with accents that pop. For example, subtle, diffused muted Sage or deep teal light glows from underneath the panels, creating a soft bloom effect on the matte surface.

- **Base colors**: Deep obsidian with violet undertone
- **Accent**: Electric blue


All visual properties must use theme tokens — no hardcoded pixel sizes or raw color values.

### Communication Protocol

#### REST API

#### WebSocket Messages

**Client → Server:**

| Type | Purpose |
|---|---|
| `subscribe` | Start receiving updates for an agent |
| `unsubscribe` | Stop receiving updates |
| `send_message` | Send a user message to an agent |
| `btw_message` | Inject a message into an active stream |
| `permission_response` | Approve, deny, or type something for a tool permission request |

**Server → Client:**

| Type | Purpose |
|---|---|
| `agent_text` | Streamed response text delta |
| `agent_activity` | Tool usage description (Read, Write, Bash, etc.) |
| `agent_result` | Success or error on stream completion |
| `agent_status` | Runtime state change (streaming, idle, closed) |
| `agent_updated` | Agent config changed |
| `agent_usage` | Token count and cost update |
| `permission_request` | Prompt user to approve/deny a tool |
| `permission_cancelled` | Permission request timed out |
| `error` | Transport or processing error |

### Build and Deployment

```bash
npm run build     # typecheck → lint → compile backend → bundle frontend → copy to backend/dist/public
npm start         # node dist/cli.js fullstack (serves API + SPA from single port)
```

The CLI supports two modes:
- `crow server` — API + WebSocket only (frontend served separately)
- `crow fullstack` — API + WebSocket + bundled SPA with fallback routing

### Configuration

Environment variables with sensible defaults:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `localhost` | Server bind address |
| `PORT` | `3030` | Server port |
| `CORS_ORIGINS` | `http://localhost:5101` | Allowed origins (comma-separated) |
| `CROW_SYSTEM_PATH` | `.crow` | Storage root directory |
| `STATIC_PATH` | `dist/public` | Frontend assets path |
| `OPENAI_BASE_URL` | — | OpenAI-compatible API for content generation |
| `OPENAI_API_KEY` | — | API key for generation endpoint |
| `OPENAI_MODEL` | — | Model name for generation |

## Design Principles

 - Backend is the source of truth: The frontend renders what the backend provides. No derived state, no duplicated logic on the client.
 - Agents are identities, not templates: Each agent config maps to exactly one agent instance. Never design patterns where one config spawns multiple instances.
 - Event-driven coordination: Loose coupling through `EventBus`. Agent deletion triggers cleanup in the registry, orchestrator, and loop scheduler independently.
 - Stream-first communication: Real-time data flows over WebSocket. REST is for queries and one-shot mutations. The UI never polls.
 - MCP for agent collaboration: Agents interact through standardized MCP tools, not ad-hoc APIs. This keeps the agent-to-agent protocol discoverable and tool-native.
 - Design tokens over hardcoded values: All visual properties use theme tokens from the Tailwind `@theme` block. No raw pixel values or color codes in components.
 - Optional features (OpenAI generation, loop automation) are conditionally initialized. The core system works without them.
 - MUST NOT use variant design pattern for UI component like variant="primary" size="md".
 - AppError MUST NOT contain http status, services throwing error should not be concern about http. This is our CCA internal error class. What status code to return is a route concern.
