import { MessageCircleQuestion } from "lucide-react";

interface AgentCardQuestionProps {
  questionCount: number;
  onOpen: () => void;
}

/**
 * Inline "needs input" indicator for dashboard cards. Answering uses the paginated panel in the
 * console, so the badge simply signals the pending question and opens the console on click.
 */
export function AgentCardQuestion({ questionCount, onOpen }: AgentCardQuestionProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors"
    >
      <MessageCircleQuestion className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-xs font-medium text-primary flex-1 text-left">Agent needs input</span>
      {questionCount > 1 && <span className="text-xs text-text-muted">{questionCount} questions</span>}
    </button>
  );
}
