# Crow Central Agency

Multi-instance Claude Code manager with a bundled web UI for orchestrating multiple Claude Code agents from one place.

Use it to build research crews, monitoring watchdogs, content pipelines, support triagers, or anything else you can shape from agents coordinating with each other.

## Features

- **Multi-agent dashboard** - run many agents in parallel, each with its own workspace, model, persona, and tool set. Agents can be backed by Claude Code or GitHub Copilot.
- **GitHub Copilot agents** - alongside Claude Code, agents can run on the GitHub Copilot SDK using your Copilot subscription. Enabled by default; toggle off with `DISABLE_GITHUB_COPILOT`.
- **Agent coordination** - compose agents into layered relationships that produce and share artifacts, adaptable to a wide range of workflows and scenarios.
- **Flexible triggers** - ad-hoc chat, assigned tasks, reminders, or scheduled prompts on configurable day-of-week / time-of-day windows.
- **Rich configuration** - per-agent MCP servers, permission modes, Discord bots, RSS feeds (with optional LLM summarization), and AI-assisted persona / `AGENT.md` generation.
- **Connectors** - per-agent identities for external services that the framework consumes to power built-in tool families. Each agent connects independently, so two agents can call the same provider (e.g. Gmail) under different accounts.
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
- `LOG_LEVEL` — log verbosity (defaults to `debug` in development, `info` otherwise).
- `CROW_SYSTEM_PATH` — directory for Crow's file-based storage. Defaults to `~/.crow`.
- `CROW_SYSTEM_AGENT_NAME` — display name for the built-in Crow system agent (default: `Crow`).
- `CROW_SYSTEM_AGENT_PROVIDER` — provider backing the built-in system agents: `CLAUDE_CODE` or `GITHUB_COPILOT` (default: `CLAUDE_CODE`). Forced to `CLAUDE_CODE` when `DISABLE_GITHUB_COPILOT` is set.
- `CROW_SYSTEM_AGENT_COPILOT_MODEL` — model for system agents when `CROW_SYSTEM_AGENT_PROVIDER=GITHUB_COPILOT` (default: `auto`).
- `STATIC_PATH` — override the directory served as frontend assets (auto-detected from the published bundle).
- `CLAUDE_CLI_PATH` — explicit path to the Claude Code CLI binary when it is not on `PATH`.
- `DISABLE_GITHUB_COPILOT` — set to `true` (or `1`) to skip starting the Copilot SDK client at boot, so GitHub Copilot is reported unavailable everywhere. Defaults to `false`.
- `COPILOT_CLI_PATH` — override the Copilot CLI runtime the SDK spawns (read directly by `@github/copilot-sdk`); leave unset to use the bundled runtime.
- `CLOSED_TASK_RETENTION_DAYS` — how long to keep closed tasks before pruning on startup (default: `30`).
- `FEED_ITEM_RETENTION_DAYS` / `FEED_REFRESH_IN_MINUTES` — feed item retention window and refresh cadence.
- `TEXT_GENERATION_*` — optional OpenAI-compatible endpoint that enables the AI-assisted persona / `AGENT.md` generation features in the agent editor.
- `FEED_TEXT_GENERATION_*` — optional OpenAI-compatible endpoint used by the feed manager to summarize feed items into a consistent length for better agent consumption.
- `FEED_MAX_SUMMARIZATION_ITEMS` — cap on items summarized per refresh (default: `50`). Items left unsummarized become retry candidates on the next refresh; when the retry backlog exceeds the cap, retries are skipped so a feed isn't permanently blocked by hundreds or thousands of stuck unsummarized items.
- `AUDIO_GENERATION_*` — optional Gemini TTS configuration that powers the play-message button on the agent console. See [Audio generation](#audio-generation) below.
- `PLACES_DEFAULT_SOURCE` — default provider for the Places tools when a lookup doesn't request one explicitly: `OSM` (default, no key needed) or `GOOGLE`. `GOOGLE` requires `GOOGLE_PLACES_API_KEY`; without it, lookups fall back to OSM. See [Places](#places) below.
- `GOOGLE_PLACES_API_KEY` — Google API key that registers the Google Places adapter alongside the default OSM source. See [Places](#places) below.
- `PHOTON_API_URL` / `OVERPASS_INTERPRETER_URL` — override the geocoding / nearby-search endpoints the OSM places source calls (default to the public Photon and Overpass instances).
- `GOOGLE_CONNECTOR_CLIENT_ID` / `GOOGLE_CONNECTOR_CLIENT_SECRET` / `CONNECTOR_CALLBACK_URL` — OAuth credentials for the Google connector. Required if you want agents to access Gmail / Calendar / Contacts. See [Connectors](#connectors) below.
- `OAUTH_PENDING_STATE_TTL_MS` — how long an unfinished OAuth flow stays valid before being swept (default: `600_000`, i.e. 10 minutes).
- `OTEL_*` — optional OpenTelemetry export.

## Audio generation

Crow can synthesize agent text messages to speech and play them back in the
agent console (per-message play button) or dashboard.

### Configuration

The feature is **opt-in** — the play button only works when all three audio
env vars are set. Add to `.env`:

```bash
AUDIO_GENERATION_PROVIDER=GOOGLE
AUDIO_GENERATION_API_KEY=<your Google API key>
AUDIO_GENERATION_MODEL=gemini-2.5-flash-preview-tts
```

Per-agent overrides (voice name + style prompt) live in the **Voice Config**
section of the agent editor. When the agent's voice is changed after audio
was already generated, the next play regenerates with the new voice.

### Google API key requirements

The `AUDIO_GENERATION_API_KEY` must be a Google API key with access to the
**Gemini API**.

You can use the same key as `TEXT_GENERATION_API_KEY` if that is also a
Gemini-backed configuration, but the two are read independently.

## Places

The **Places** MCP server gives agents location tools — `geocode_place`,
`search_nearby_places`, and `get_place_details`. It is enabled per-agent from
the **MCP Servers** section of the agent editor.

Two providers back these tools:

- **OSM** (default) — uses the public OpenStreetMap-based services (Photon for
  geocoding, Overpass for nearby search). No API key required, so the Places
  tools work out of the box.
- **GOOGLE** — uses the Google Places API (New) and Geocoding API for richer
  results. Opt in by setting `GOOGLE_PLACES_API_KEY`.

`PLACES_DEFAULT_SOURCE` selects which provider serves lookups that don't name a
source explicitly (`OSM` or `GOOGLE`, defaulting to `OSM`). When
`GOOGLE_PLACES_API_KEY` is set, the Google adapter is registered alongside OSM;
if `PLACES_DEFAULT_SOURCE=GOOGLE` is set without a key, lookups fall back to OSM.

### Configuration

```bash
PLACES_DEFAULT_SOURCE=GOOGLE
GOOGLE_PLACES_API_KEY=<your Google API key>
```

### Getting a Google Places API key

The key is a plain Google API key (not an OAuth client — unrelated to the
Google connector setup below).

**1. Sign in to Google Cloud Console.**

Go to [console.cloud.google.com](https://console.cloud.google.com/) and select
(or create) a project. Unlike the OAuth connector, the Places and Geocoding
APIs are **paid** and require a billing account on the project. Google provides
a recurring monthly free allotment, but you must still enable billing to use
the key.

**2. Enable the required APIs.**

Open **APIs & Services → Library** and enable both:

- **Places API (New)** — powers `search_nearby_places` and `get_place_details`.
- **Geocoding API** — powers reverse geocoding for `geocode_place`.

Click each result, then click **Enable**.

**3. Create the API key.**

Open **APIs & Services → Credentials → Create Credentials → API key**. Copy the
generated key.

> [!NOTE]
> Restrict the key to just the **Places API (New)** and **Geocoding API** under
> the key's **API restrictions** so a leaked key can't be used against other
> Google services.

**4. Add the key to your `.env` and restart Crow.**

```bash
GOOGLE_PLACES_API_KEY=<paste the API key>
PLACES_DEFAULT_SOURCE=GOOGLE
```

Restart the server so it picks up the new env vars.

## Connectors

Connectors are a framework-level capability - they are not tools agents call
directly. A connector binds a **per-agent identity** to an external service;
the framework then uses that identity to power built-in features for the
agent. Today the Google connector backs the Gmail tool family: when an agent
has a Google connection, the Gmail MCP server is wired up automatically.

Because the binding is per-agent, two agents can connect to the same
provider as **different identities**. An inbox-triage agent can use one
Google account while a calendar-scheduling agent uses another, and neither
sees the other's credentials.

### Google connector

**Status**: Gmail, Google Calendar, and Google Contacts tool families are live.

**Tools powered by the Google connector:**

_Gmail_

- `list_gmail_messages`, `get_gmail_message_content`, `get_gmail_thread` — read
  inbox, message bodies (rendered as markdown), and conversation threads.
- `send_gmail_message`, `reply_to_gmail_message` — compose and reply.
- `move_gmail_message_to_trash` — soft-delete a message.
- `list_gmail_labels` — discover system + user-defined labels.
- `update_gmail_message_user_labels` - attach / detach user labels on a
  message.
- `update_gmail_message_state` — flip read / archived / starred / important flag on a message.
- `create_gmail_user_label`, `delete_gmail_user_label` — manage user-defined
  labels (folders/tags).

_Google Calendar_

- `list_google_calendars` — discover the calendars the connected account
  can access.
- `list_google_calendar_events` — browse events on a calendar.
- `get_google_calendar_event` — fetch the full description, per-attendee RSVP status, and Meet/Hangout link.
- `create_google_calendar_event` — schedule an event.
- `update_google_calendar_event` — edit an existing event in place.
- `delete_google_calendar_event` — cancel and remove an event; Google
  sends cancellation emails to any attendees.

_Google Contacts_

- `search_google_contacts` — look up the user's saved contacts by name,
  email, phone, or organization fragment; returns the full email and
  phone lists per match plus primary organization details.

### Setup (Google)

The Google connector authenticates via OAuth, which means **you** create a
small "OAuth app" in your own Google Cloud account and give Crow its
credentials.

**This is a one-time setup.** The single OAuth app you create here works
for any number of Google accounts (up to 100 for unverified app). Each agent in
Crow signs in independently, so one agent can connect as `agent1@gmail.com`,
another as `agent2@example.com`, and a third can share
agent1's account. The only per-account step you'll repeat is adding each new Google account
as a **test user** on your OAuth app's **Audience** page (covered in
step 4 below; revisit later when you want to add a new account).

If you have never used Google Cloud before, follow every step; experienced
users can skim.

**1. Sign in to Google Cloud Console.**

Go to [console.cloud.google.com](https://console.cloud.google.com/) and
sign in with your Google account you want to manage the OAuth app
(the OAuth app and the user you connect with don't have to match).
If this is your first time, accept the terms of service. **No
billing is required** for creating OAuth app.

Note: `Start free` button would start a free trial and will require credit card information.

**2. Create a project.**

Click the project picker in the top bar (next to "Google Cloud") and choose
**New Project**. Give it any name (e.g. `Crow Connector`) and click **Create**. After
a few seconds, switch to the new project from the same picker.

**3. Enable the APIs the connector needs.**

Open **APIs & Services → Library** from the left sidebar (or the hamburger
menu). Search for and enable each of:

- **Gmail API**
- **Google Calendar API**
- **Google People API**

Click each result, then click the **Enable** button.

**4. Configure the OAuth consent screen and add test users.**

Open **APIs & Services → OAuth consent screen**. Pick **External** (unless
you have a Google Workspace organization). Fill in the required fields:

- **App name** — anything, e.g. `Crow Connector`.
- **User support email** - your email.
- **Developer contact email** - your email.

Save and complete the wizard (no changes needed on the Scopes / Optional
Info pages).

Then go to the **Audience** tab (left sidebar of the OAuth consent screen
section). Under **Test users**, click **Add users** and add every Google
account you intend to connect from Crow - your own account, plus any
other accounts you'll use for separate agents. Save.

> While the app is in **Testing** mode, only the accounts on the Audience
> page can sign in - that is the expected setup for personal use. You
> don't need to publish or get verified by Google.
>
> **Adding more accounts later:** every time you want a new agent to
> connect with a Google account that isn't already a test user, come back
> to this **Audience** page and add it. The OAuth app, your `.env`, and
> existing connected agents are unaffected.

**5. Create the OAuth client credentials.**

Open **APIs & Services → Credentials → Create Credentials → OAuth client
ID**.

- **Application type**: **Web application** (this is correct even though
  Crow runs locally - the OAuth flow uses an HTTP redirect).
- **Name**: anything, e.g. `Crow local`.
- **Authorized redirect URIs**: click **Add URI** and paste exactly:

  ```
  http://localhost:3101/auth/callback
  ```

  (If you changed `PORT` in your `.env`, use that port instead.)

> [!NOTE]
> You can register multiple callback URIs. This is useful if you also run
> Crow behind a local TLS-terminating reverse proxy (e.g. Caddy or nginx
> with a self-signed cert) so the OAuth callback comes in over HTTPS -
> for example, add `https://localhost:8080/auth/callback` alongside the
> plain `http://localhost:3101/auth/callback`. Set `CONNECTOR_CALLBACK_URL`
> to whichever URL the browser will actually hit (typically the proxy's),
> and add the proxy's origin to `CORS_ORIGINS`.
>
> Google rejects raw LAN IPs (e.g. `192.168.1.10`) as redirect URIs. To
> reach Crow from another device on your network, map a hostname like
> `crow.lan` to the host's IP via your `hosts` file (or your router's
> local DNS), and register `https://crow.lan/auth/callback` instead.

Click **Create**. A popup shows the **Client ID** and **Client secret** -
keep this open or copy both values somewhere temporary; you'll need them
in the next step.

**6. Add the credentials to your `.env`.**

```bash
GOOGLE_CONNECTOR_CLIENT_ID=<paste the Client ID>
GOOGLE_CONNECTOR_CLIENT_SECRET=<paste the Client secret>
CONNECTOR_CALLBACK_URL=http://localhost:3101/auth/callback
```

The redirect URI here must match the one you entered in step 5 character
for character.

**7. Restart Crow and connect an agent.**

Restart the server so it picks up the new env vars. Then in the UI:

1. Open the agent you want to give Gmail access (or create one).
2. Scroll to the **Connectors** section in the editor.
3. Click **Connect** next to Google.
4. Sign in as one of the test users you added in step 4 and approve the
   requested scopes.
5. The connector row switches to "Connected as `<your-email>`" — the
   Google connection is now stored for this agent.
6. Scroll to the **MCP Servers** section of the same editor. The **Gmail**
   server now appears in the list. Toggle it on, then save the agent. Until you
   enable it here, the connection is stored but the agent has no Gmail
   tools wired in.

> [!NOTE]
> On the first sign-in for a Google account, the consent screen lists each
> requested scope with its own checkbox (Gmail, Calendar, Contacts, etc.).
> Google leaves them **unchecked by default**. Tick **all of them** before
> clicking Allow — any scope you skip won't be granted, the corresponding
> tool family won't work for this agent, and the connector row will show
> a "reconnect to enable new features" hint until you redo the flow with
> the missing scopes selected.

Repeat step 7 for each additional agent that needs Google access — same
OAuth app, any Google account that's on your Audience test-users list.

### Disconnecting

In the agent editor, the **Disconnect** button on the connector row clears
both the keyring entry and the on-disk metadata for that agent. Revoking
from the [Google account permissions page](https://myaccount.google.com/permissions)
is also detected on the next refresh - Crow surfaces it as `UNAUTHORIZED`
and clears the connection automatically.

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
