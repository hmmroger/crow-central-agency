import { useCallback, useMemo, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { ComboboxDropdown } from "../../common/combobox-dropdown.js";
import { ComboboxOption } from "../../common/combobox-option.js";
import { useComboboxDropdown } from "../../common/use-combobox-dropdown.js";
import { dispositionForUsage, type PermissionRuleUsage } from "./permission-rule-usage.js";
import { TOOL_DISPOSITION } from "./tool-permission.js";

interface PermissionRuleComboboxProps {
  value: string;
  options: PermissionRuleUsage[];
  inputRef: RefObject<HTMLInputElement | null>;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onSelectRule: (usage: PermissionRuleUsage) => void;
}

const RULE_INPUT_PLACEHOLDER = "e.g. mcp__server__tool or Bash(git commit *)";

function formatUsageCounts(usage: PermissionRuleUsage): string {
  if (usage.approvedCount > 0 && usage.deniedCount > 0) {
    return `${usage.approvedCount} approve · ${usage.deniedCount} deny`;
  }

  const total = usage.approvedCount + usage.deniedCount;
  return total === 1 ? "1 agent" : `${total} agents`;
}

/**
 * Type-ahead over the permission rules already configured across the fleet. Enter adds the
 * highlighted rule; Tab completes it into the input instead, leaving a near-match editable.
 */
export function PermissionRuleCombobox({
  value,
  options,
  inputRef,
  onValueChange,
  onSubmit,
  onSelectRule,
}: PermissionRuleComboboxProps) {
  const filteredOptions = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (needle.length === 0) {
      return options;
    }

    return options.filter((usage) => usage.rule.toLowerCase().includes(needle));
  }, [options, value]);

  const handleCommitOption = useCallback(
    (index: number) => {
      const usage = filteredOptions[index];
      if (usage) {
        onSelectRule(usage);
      }
    },
    [filteredOptions, onSelectRule]
  );

  const handleCompleteOption = useCallback(
    (index: number) => {
      const usage = filteredOptions[index];
      if (usage) {
        onValueChange(usage.rule);
      }
    },
    [filteredOptions, onValueChange]
  );

  const {
    isOpen,
    activeIndex,
    setActiveIndex,
    commitOption,
    open,
    toggle,
    handleKeyDown: handleDropdownKeyDown,
    handleContainerBlur,
    referenceRef,
    referenceProps,
    floatingRef,
    floatingProps,
    floatingStyles,
  } = useComboboxDropdown({
    optionCount: filteredOptions.length,
    onCommitOption: handleCommitOption,
    onCompleteOption: handleCompleteOption,
  });

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValueChange(event.target.value);
      setActiveIndex(0);
      open();
    },
    [onValueChange, setActiveIndex, open]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !(isOpen && filteredOptions.length > 0)) {
        event.preventDefault();
        onSubmit();
        return;
      }

      handleDropdownKeyDown(event);
    },
    [isOpen, filteredOptions.length, onSubmit, handleDropdownKeyDown]
  );

  const handleToggleOpen = useCallback(() => {
    toggle();
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen, toggle, inputRef]);

  const emptyMessage = value.trim().length > 0 ? "No matching rules" : "No rules from other agents";

  return (
    <>
      <div
        ref={referenceRef}
        {...referenceProps}
        onBlur={handleContainerBlur}
        className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle focus-within:border-border-focus transition-colors"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={RULE_INPUT_PLACEHOLDER}
          aria-label={RULE_INPUT_PLACEHOLDER}
          className="min-w-0 flex-1 bg-transparent text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label={isOpen ? "Hide configured rules" : "Browse configured rules"}
          className="shrink-0 text-text-muted hover:text-text-neutral transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <ComboboxDropdown
          floatingRef={floatingRef}
          floatingStyles={floatingStyles}
          floatingProps={floatingProps}
          isEmpty={filteredOptions.length === 0}
          emptyMessage={emptyMessage}
        >
          {filteredOptions.map((usage, index) => {
            const isDenied = dispositionForUsage(usage) === TOOL_DISPOSITION.DENY;

            return (
              <ComboboxOption
                key={usage.rule}
                index={index}
                isActive={index === activeIndex}
                onActivate={setActiveIndex}
                onCommit={commitOption}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{usage.rule}</span>
                <span className={cn("shrink-0 text-2xs font-medium", isDenied ? "text-error" : "text-success")}>
                  {isDenied ? "Deny" : "Approve"}
                </span>
                <span className="shrink-0 text-2xs text-text-muted">{formatUsageCounts(usage)}</span>
              </ComboboxOption>
            );
          })}
        </ComboboxDropdown>
      )}
    </>
  );
}
