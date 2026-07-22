import { useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "../../../utils/cn";
import { sanitizeHtml } from "../../../utils/html-sanitizer";

interface QuestionOptionProps {
  label: string;
  description: string;
  preview?: string;
  active: boolean;
  onSelect: (label: string) => void;
}

/**
 * A single selectable answer option: label + description, with an optional contained HTML preview.
 * Selection semantics (single vs multi) are owned by the parent; this only reflects `active`.
 */
export function QuestionOption({ label, description, preview, active, onSelect }: QuestionOptionProps) {
  const handleClick = useCallback(() => onSelect(label), [onSelect, label]);

  const previewHtml = useMemo(() => (preview ? sanitizeHtml(preview) : undefined), [preview]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-md border p-2.5 transition-colors",
        active ? "border-primary/50 bg-primary/10" : "border-border-subtle bg-surface-inset hover:border-border"
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("flex-1 text-sm font-medium", active ? "text-primary" : "text-text-neutral")}>{label}</span>
        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </div>
      {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      {previewHtml && (
        <div
          className="mt-2 rounded bg-surface-inset p-2 text-xs text-text-muted overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}
    </button>
  );
}
