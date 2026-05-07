import { useEffect } from "react";
import { useOpenAgentEditor } from "./dialogs/use-open-agent-editor.js";

const QUERY_PARAM_AGENT = "agent";
const QUERY_PARAM_CONNECTOR = "connector";
const QUERY_PARAM_STATUS = "status";
const QUERY_PARAM_REASON = "reason";
const STATUS_OK = "ok";
const STATUS_ERROR = "error";

/**
 * Consume post-OAuth-callback query params and scrub them from the URL.
 *
 * The backend redirects here with
 * `?agent=<id>&connector=<id>&status=ok|error&reason=...` after completing
 * a connector OAuth flow.
 */
export function useConnectorCallbackHandler() {
  const openAgentEditor = useOpenAgentEditor();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const agent = params.get(QUERY_PARAM_AGENT);
    const connector = params.get(QUERY_PARAM_CONNECTOR);
    const status = params.get(QUERY_PARAM_STATUS);
    if (!agent || !connector || !status) {
      return;
    }

    const reason = params.get(QUERY_PARAM_REASON) ?? undefined;
    if (status === STATUS_ERROR) {
      console.error("Connector flow failed:", { agent, connector, reason });
    } else if (status === STATUS_OK) {
      console.info(`Connector ${connector} connected for agent ${agent}.`);
    }

    params.delete(QUERY_PARAM_AGENT);
    params.delete(QUERY_PARAM_CONNECTOR);
    params.delete(QUERY_PARAM_STATUS);
    params.delete(QUERY_PARAM_REASON);
    const cleanQuery = params.toString();
    const cleanUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "");
    window.history.replaceState(null, "", cleanUrl);

    openAgentEditor({ agentId: agent });
  }, [openAgentEditor]);
}
