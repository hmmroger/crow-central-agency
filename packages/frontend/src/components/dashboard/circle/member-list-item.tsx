import { useListItem } from "@floating-ui/react";
import { Bot, CircleDot, X } from "lucide-react";
import { ENTITY_TYPE, type EntityType } from "@crow-central-agency/shared";
import { useModalDialogListNav } from "../../../providers/modal-dialog-list-nav-provider.js";
import { cn } from "../../../utils/cn.js";

interface MemberListItemProps {
  entityId: string;
  entityType: EntityType;
  name: string;
  isSelected: boolean;
  disabled?: boolean;
  onToggle: (entityId: string) => void;
}

export function MemberListItem({ entityId, entityType, name, isSelected, disabled, onToggle }: MemberListItemProps) {
  const { activeIndex, getItemProps } = useModalDialogListNav();
  const { ref, index } = useListItem({ label: name });
  const isActive = activeIndex === index;

  const Icon = entityType === ENTITY_TYPE.AGENT ? Bot : CircleDot;

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={isActive ? 0 : -1}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left",
        "transition-colors text-sm",
        isActive && "ring-1 ring-border-focus",
        isSelected
          ? "bg-primary/10 border border-primary/25 text-primary"
          : "border border-transparent hover:bg-surface-elevated text-text-muted hover:text-text-neutral"
      )}
      {...getItemProps({
        onClick: () => onToggle(entityId),
      })}
      disabled={disabled}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium truncate flex-1">{name}</span>
      {isSelected && <X className="w-3 h-3 shrink-0 opacity-60" />}
    </button>
  );
}
