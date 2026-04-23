import { Plus, Circle, BookmarkPlus } from "lucide-react";
import { useOpenAgentEditor } from "../../hooks/dialogs/use-open-agent-editor.js";
import { useOpenTemplatePicker } from "../../hooks/dialogs/use-open-template-picker.js";
import { useOpenCircleEditor } from "./circle/use-open-circle-editor.js";
import { DashboardWidget } from "./dashboard-widget.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";
import { useCallback } from "react";

interface DashboardActionsProps {
  className?: string;
  /** When true, render icon-only buttons inline without the widget wrapper */
  compact?: boolean;
}

/**
 * Actions section for the dashboard.
 * Owns its own action handlers for creating agents and circles.
 */
export function DashboardActions({ className, compact = false }: DashboardActionsProps) {
  const openAgentEditor = useOpenAgentEditor();
  const openTemplatePicker = useOpenTemplatePicker();
  const openCircleEditor = useOpenCircleEditor();

  const handleNewFromTemplate = useCallback(() => {
    openTemplatePicker((template) => openAgentEditor({ templatePreset: template }));
  }, [openTemplatePicker, openAgentEditor]);

  const newAgentButton = (
    <ActionButton
      icon={Plus}
      label="New Agent"
      variant={ACTION_BUTTON_VARIANT.PRIMARY}
      iconOnly={compact}
      onClick={() => openAgentEditor()}
    />
  );

  const newFromTemplateButton = (
    <ActionButton
      icon={BookmarkPlus}
      label="New Agent from Template"
      variant={ACTION_BUTTON_VARIANT.SECONDARY}
      iconOnly={compact}
      onClick={handleNewFromTemplate}
    />
  );

  const newCircleButton = (
    <ActionButton
      icon={Circle}
      label="New Circle"
      variant={ACTION_BUTTON_VARIANT.SECONDARY}
      iconOnly={compact}
      onClick={() => openCircleEditor()}
    />
  );

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {newAgentButton}
        {newFromTemplateButton}
        {newCircleButton}
      </div>
    );
  }

  return (
    <DashboardWidget title="Actions" className={className}>
      <div className="flex flex-col gap-2">
        {newAgentButton}
        {newFromTemplateButton}
        {newCircleButton}
      </div>
    </DashboardWidget>
  );
}
