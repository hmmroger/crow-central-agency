/**
 * Agent query telemetry — trace spans and metrics for agent query execution.
 *
 * Uses `@opentelemetry/api` global providers which return no-op implementations
 * when the SDK is not enabled, so no conditional checks are needed in business code.
 */

import { trace, metrics, SpanStatusCode, type Span, type Histogram, type Counter } from "@opentelemetry/api";

/** Metric instruments for agent query telemetry */
interface AgentMetrics {
  inputTokens: Histogram;
  outputTokens: Histogram;
  duration: Histogram;
  toolUsage: Counter;
}

/** Common attributes for all agent telemetry */
interface AgentAttributes {
  "agent.id": string;
  "agent.name": string;
}

const TRACER_NAME = "crow.agent";
const METER_NAME = "crow.agent";
const MS_PER_SECOND = 1000;

/** Lazily obtained tracer — safe to call whether SDK is enabled or not */
const getTracer = () => trace.getTracer(TRACER_NAME);

/** Create all metric instruments from the global meter */
function createMetrics(): AgentMetrics {
  const meter = metrics.getMeter(METER_NAME);

  return {
    inputTokens: meter.createHistogram("agent.query.input_tokens", {
      description: "Total input tokens per assistant message (includes cache read and creation tokens)",
      unit: "tokens",
    }),
    outputTokens: meter.createHistogram("agent.query.output_tokens", {
      description: "Output tokens per assistant message",
      unit: "tokens",
    }),
    duration: meter.createHistogram("agent.query.duration", {
      description: "Total query duration",
      unit: "s",
    }),
    toolUsage: meter.createCounter("agent.query.tool_use", {
      description: "Number of times each tool was invoked during an agent query",
      unit: "invocations",
    }),
  };
}

/** Lazily initialized metric instruments */
let agentMetrics: AgentMetrics | undefined;

function getMetrics(): AgentMetrics {
  if (!agentMetrics) {
    agentMetrics = createMetrics();
  }

  return agentMetrics;
}

/**
 * Wrapper around an OpenTelemetry span for agent query lifecycle.
 * Encapsulates attribute setup and metric recording.
 */
export class AgentQuerySpan {
  private readonly span: Span;
  private readonly agentAttributes: AgentAttributes;

  constructor(span: Span, agentAttributes: AgentAttributes) {
    this.span = span;
    this.agentAttributes = agentAttributes;
  }

  /** Set the session ID attribute (called on INIT event) */
  public setSessionId(sessionId: string): void {
    this.span.setAttribute("agent.session_id", sessionId);
  }

  /** Record a tool use as a span event */
  public addToolUseEvent(toolName: string, description: string): void {
    getMetrics().toolUsage.add(1, { ...this.agentAttributes, "tool.name": toolName });
    this.span.addEvent("tool_use", {
      "tool.name": toolName,
      "tool.description": description,
    });
  }

  /** Record token usage metrics for a single assistant message */
  public recordTokenUsage(inputTokens: number, outputTokens: number, totalInputTokens: number): void {
    const m = getMetrics();
    const attributes = { ...this.agentAttributes };
    m.inputTokens.record(totalInputTokens, attributes);
    m.outputTokens.record(outputTokens, attributes);

    this.span.addEvent("message_done", {
      "message.input_tokens": inputTokens,
      "message.output_tokens": outputTokens,
      "message.total_input_tokens": totalInputTokens,
    });
  }

  /** End span on successful query completion */
  public endSuccess(durationMs: number, doneType: string): void {
    getMetrics().duration.record(durationMs / MS_PER_SECOND, { ...this.agentAttributes });

    this.span.setAttribute("agent.done_type", doneType);
    this.span.setAttribute("agent.duration_ms", durationMs);
    this.span.setStatus({ code: SpanStatusCode.OK });
    this.span.end();
  }

  /** End span on abort — UNSET status (not an error, but not a success) */
  public endAborted(): void {
    this.span.setAttribute("agent.done_type", "aborted");
    this.span.setStatus({ code: SpanStatusCode.UNSET });
    this.span.end();
  }

  /** End span on error with exception recording for stack traces */
  public endError(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    if (error instanceof Error) {
      this.span.recordException(error);
    }

    this.span.setAttribute("agent.error", errorMessage);
    this.span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    this.span.end();
  }
}

/**
 * Start a new trace span for an agent query.
 * @param agentId - The agent's unique ID
 * @param agentName - The agent's display name
 * @param sourceType - What triggered the query (USER, TASK, LOOP, etc.)
 */
export function startQuerySpan(agentId: string, agentName: string, sourceType: string): AgentQuerySpan {
  const agentAttributes: AgentAttributes = {
    "agent.id": agentId,
    "agent.name": agentName,
  };

  const span = getTracer().startSpan("agent.query", {
    attributes: {
      ...agentAttributes,
      "agent.source_type": sourceType,
    },
  });

  return new AgentQuerySpan(span, agentAttributes);
}
