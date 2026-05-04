import { useCallback } from "react";
import type { AgentConfigTemplate } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { TemplatePickerDialog } from "../../components/dashboard/template-picker-dialog.js";

const TEMPLATE_PICKER_DIALOG_ID = "template-picker";

/**
 * Hook to open the template picker as a modal dialog.
 *
 * @returns A function that opens the picker — pass an onSelect callback invoked with the chosen template.
 */
export function useOpenTemplatePicker() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (onSelect: (template: AgentConfigTemplate) => void) => {
      showDialog({
        id: TEMPLATE_PICKER_DIALOG_ID,
        component: TemplatePickerDialog,
        componentProps: { onSelect },
        title: "New Agent from Template",
        className: "w-[95vw] md:w-md",
        listNavigation: true,
      });
    },
    [showDialog]
  );
}
