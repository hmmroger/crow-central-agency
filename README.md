# Crow Central Agency

Multi-instance Claude Code manager with a bundled web UI for orchestrating multiple Claude Code agents from one place.

Use it to build research crews, monitoring watchdogs, content pipelines, support triagers, or anything else you can shape from agents coordinating with each other.

## Features

- **Multi-agent dashboard** - run many Claude Code agents in parallel, each with its own workspace, model, persona, and tool set.
- **Agent coordination** - compose agents into layered relationships that produce and share artifacts, adaptable to a wide range of workflows and scenarios.
- **Flexible triggers** - ad-hoc chat, assigned tasks, reminders, or scheduled prompts on configurable day-of-week / time-of-day windows.
- **Rich configuration** - per-agent MCP servers, permission modes, Discord bots, RSS feeds (with optional LLM summarization), and AI-assisted persona / `AGENT.md` generation.
- **OpenTelemetry export** - optional traces and metrics for every agent query (see below).

## Requirements

- Node.js `>=24`
- Claude Code CLI available on `PATH` (or set `CLAUDE_CLI_PATH`)

## Quick start

1. **Install Node.js `>=24`.** Check your version with `node --version`. If it is missing or older, install from [nodejs.org](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm) (`nvm install 24 && nvm use 24`).

2. **Install the Claude Code CLI.** Make sure the `claude` command is on your `PATH` (or point `CLAUDE_CLI_PATH` at the binary). Verify with `claude --version`.

3. **Create a `.env` file with an `ACCESS_KEY`.** Pick any non-empty string — a long random value is recommended. A dedicated folder like `~/.crow` keeps it out of your project directories:

   ```bash
   mkdir -p ~/.crow
   echo "ACCESS_KEY=your-secret-value" > ~/.crow/.env
   ```

   TIP: Generate a strong value with `openssl rand -hex 32`.

4. **Start Crow**, pointing at the env file you just created:

   ```bash
   npx crow-central-agency --env-file ~/.crow/.env
   ```

5. **Open [http://localhost:3101](http://localhost:3101)** in your browser. On first load the UI prompts for the access key — paste the same value you set in step 3.

### Run from a cloned repo

```bash
git clone https://github.com/hmmroger/crow-central-agency.git
cd crow-central-agency
npm install
npm run build
npm start -- --env-file ~/.crow/.env
```

`npm start` runs the same single-box entry point as the published CLI.

## Configuration

Crow reads configuration from environment variables. The simplest approach is to copy `.env.example` to `.env` in the directory you launch from — `dotenv` loads it automatically on startup.

```bash
cp .env.example .env
```

### Required: `ACCESS_KEY`

`ACCESS_KEY` is the only required variable. It is a shared secret between the server and the browser UI — you **choose the value yourself**; there is no default and no external provisioning.

1. Pick any non-empty string (a long random value is recommended, e.g. `openssl rand -hex 32`).
2. Set `ACCESS_KEY=<your value>` in `.env`.
3. On first load, the web UI prompts for the access key — enter the same value. It is then stored in the browser and sent as `Authorization: Bearer <key>` on API requests (and as a query param on the WebSocket connection).

Requests without a valid key receive `401 Unauthorized`.

### Custom env file path

To load a `.env` from a non-default location, pass `--env-file`:

```bash
npx crow-central-agency --env-file /path/to/custom.env
```

The same flag works with `npm start` when running from a clone:

```bash
npm start -- --env-file /path/to/custom.env
```

If `--env-file` is omitted, `dotenv` falls back to `.env` in the current working directory.

### Other variables

See `.env.example` for the full list, including:

- `HOST` / `PORT` — server bind address (defaults: `localhost:3101`). Keep `HOST=localhost` and front the server with a secure tunnel for remote access rather than binding to `0.0.0.0`.
- `CORS_ORIGINS` — only needed when the frontend is served from a different origin (e.g. during frontend dev). Single-box deployments can leave it unset.
- `CROW_SYSTEM_PATH` — directory for Crow's file-based storage. Defaults to `~/.crow`.
- `TEXT_GENERATION_*` — optional OpenAI-compatible endpoint that enables the AI-assisted persona / `AGENT.md` generation features in the agent editor.
- `FEED_TEXT_GENERATION_*` — optional OpenAI-compatible endpoint used by the feed manager to summarize feed items into a consistent length for better agent consumption.
- `OTEL_*` — optional OpenTelemetry export.
- `ANTHROPIC_API_KEY` — Anthropic API key.

## OpenTelemetry

Crow emits traces and metrics via `@opentelemetry/sdk-node`. Telemetry is off by default — set `OTEL_ENABLED=true` along with the standard OTel env vars (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, etc.) to export to your collector.

Built-in HTTP/Fastify/Undici instrumentations cover inbound requests and outgoing HTTP calls. On top of that, Crow adds agent-query instrumentation under the `crow.agent` tracer and meter.

> [!NOTE]
> Unlike typical operational telemetry, Crow's spans include user-authored content on attributes and events — notably `agent.name` and `tool.description` (the latter often derived from tool-use input). Error messages and recorded exceptions (`agent.error`) may also contain PII surfaced from underlying tools or model output. Anything you export is visible to whatever OTel backend you point at, so only send telemetry to a provider you trust.

### Traces — `crow.agent`

One span per agent query, named `agent.query`.

Span attributes:

- `agent.id`, `agent.name` — identity of the agent being queried
- `agent.source_type` — what triggered the query (e.g. `USER`, `TASK`, `LOOP`)
- `agent.session_id` — Claude Code session id (set once the `INIT` event arrives)
- `agent.done_type` — terminal reason (`aborted`, or the done-event type on success)
- `agent.duration_ms` — total query duration
- `agent.error` — error message on failure (span status set to `ERROR`, exception recorded with stack trace)

Span events:

- `tool_use` — emitted per tool invocation with `tool.name` and `tool.description`
- `message_done` — emitted per assistant message with `message.input_tokens`, `message.output_tokens`, `message.total_input_tokens` (the last includes cache-read and cache-creation tokens)

### Metrics — `crow.agent`

All metrics are tagged with `agent.id` and `agent.name`.

- `agent.query.input_tokens` (histogram, unit `tokens`) — total input tokens per assistant message, including cache-read and cache-creation tokens
- `agent.query.output_tokens` (histogram, unit `tokens`) — output tokens per assistant message
- `agent.query.duration` (histogram, unit `s`) — total duration of each agent query
- `agent.query.tool_use` (counter, unit `invocations`) — tool invocations, additionally tagged with `tool.name`

## License

MIT
