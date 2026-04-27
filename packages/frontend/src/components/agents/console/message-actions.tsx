import type { AgentMessage } from "@crow-central-agency/shared";
import { MessageAudioButton } from "./message-audio-button.js";

interface MessageActionsProps {
  agentId: string;
  message: AgentMessage;
}

/**
 * The single home for per-message action buttons.
 *
 * Callers drop this in below any message bubble — they never reference specific
 * action components. Each child action is responsible for deciding whether it
 * applies to the given message and returning `null` otherwise; new actions are
 * added by creating a self-gating component and adding one line below.
 *
 * The row is hidden until the surrounding `group` is hovered, and stays
 * visible while any child sets `data-active="true"` (via :has()).
 */
export function MessageActions({ agentId, message }: MessageActionsProps) {
  return (
    <div className="flex items-center gap-1 px-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto has-data-[active=true]:opacity-100 has-data-[active=true]:pointer-events-auto transition-opacity">
      <MessageAudioButton agentId={agentId} message={message} />
    </div>
  );
}
