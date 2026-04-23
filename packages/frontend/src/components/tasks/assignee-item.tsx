import type { ComponentType } from "react";
import { useListItem } from "@floating-ui/react";
import { useModalDialogListNav } from "../../providers/modal-dialog-list-nav-provider.js";
import { cn } from "../../utils/cn.js";

interface AssigneeItemProps {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export function AssigneeItem({ id, label, icon: Icon, isSelected, disabled, onSelect }: AssigneeItemProps) {
  const { activeIndex, getItemProps } = useModalDialogListNav();
  const { ref, index } = useListItem({ label });
  const isActive = activeIndex === index;

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-left",
        "transition-colors text-sm",
        isActive && "ring-1 ring-border-focus",
        isSelected
          ? "bg-primary/12 border border-primary/30 text-primary"
          : "border border-transparent hover:bg-surface-elevated text-text-neutral hover:text-text-base"
      )}
      {...getItemProps({
        onClick: () => onSelect(id),
      })}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="font-medium truncate">{label}</span>
    </button>
  );
}
