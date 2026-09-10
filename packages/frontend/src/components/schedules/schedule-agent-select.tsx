import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChevronDown, Users } from "lucide-react";
import { cn } from "../../utils/cn.js";
import { ComboboxDropdown } from "../common/combobox-dropdown.js";
import { ComboboxOption } from "../common/combobox-option.js";
import { useComboboxDropdown } from "../common/use-combobox-dropdown.js";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { ScheduleAgentChip } from "./schedule-agent-chip.js";

interface ScheduleAgentSelectProps {
  /** Ids of the agents the schedule targets */
  selectedAgentIds: string[];
  /** Fired when the user toggles an agent's selection */
  onToggle: (agentId: string) => void;
  /** Text shown when no agents exist */
  emptyText?: string;
}

/**
 * Type-ahead picker for the agents a schedule targets. Typing narrows the option list and the
 * chevron browses every agent; Enter/Tab commits the highlighted option and Backspace on an empty
 * input removes the last selection. Selected agents render as removable chips below the input.
 * Renders its own content only — the caller owns the surrounding label / layout.
 */
export function ScheduleAgentSelect({
  selectedAgentIds,
  onToggle,
  emptyText = "No agents available.",
}: ScheduleAgentSelectProps) {
  const { agents, isLoading } = useAgentsContext();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const needle = inputValue.trim().toLowerCase();

  const options = useMemo(
    () => agents.filter((agent) => !selectedAgentIds.includes(agent.id) && agent.name.toLowerCase().includes(needle)),
    [agents, selectedAgentIds, needle]
  );

  const selectedAgents = useMemo(
    () =>
      selectedAgentIds
        .map((agentId) => agents.find((agent) => agent.id === agentId))
        .filter((agent) => agent !== undefined),
    [selectedAgentIds, agents]
  );

  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) {
        return;
      }

      onToggle(option.id);
      setInputValue("");
      inputRef.current?.focus();
    },
    [options, onToggle]
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
  } = useComboboxDropdown({ optionCount: options.length, onCommitOption: selectOption });

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
      setActiveIndex(0);
      open();
    },
    [setActiveIndex, open]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        if (inputValue === "" && selectedAgentIds.length > 0) {
          onToggle(selectedAgentIds[selectedAgentIds.length - 1]);
        }

        return;
      }

      handleDropdownKeyDown(event);
    },
    [inputValue, selectedAgentIds, onToggle, handleDropdownKeyDown]
  );

  const handleToggleOpen = useCallback(() => {
    toggle();
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen, toggle]);

  if (isLoading || agents.length === 0) {
    return <p className="text-xs text-text-muted">{isLoading ? "Loading agents..." : emptyText}</p>;
  }

  const emptyMessage = needle.length > 0 ? "No agents match the filter." : "All agents selected.";

  return (
    <div className="space-y-1.5">
      <div
        ref={referenceRef}
        {...referenceProps}
        onBlur={handleContainerBlur}
        className={cn(
          "flex items-center gap-1.5 rounded border bg-surface-inset px-2 py-1 transition-colors",
          isOpen ? "border-border-focus" : "border-border-subtle"
        )}
      >
        <Users className="h-3 w-3 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={open}
          placeholder="Search agents by name..."
          aria-label="Search agents to target by name"
          className="min-w-0 flex-1 bg-transparent text-xs text-text-base placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label={isOpen ? "Hide agents" : "Browse agents"}
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
          isEmpty={options.length === 0}
          emptyMessage={emptyMessage}
        >
          {options.map((agent, index) => (
            <ComboboxOption
              key={agent.id}
              index={index}
              isActive={index === activeIndex}
              onActivate={setActiveIndex}
              onCommit={commitOption}
            >
              <span className="truncate">{agent.name}</span>
            </ComboboxOption>
          ))}
        </ComboboxDropdown>
      )}

      {selectedAgents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedAgents.map((agent) => (
            <ScheduleAgentChip key={agent.id} agentId={agent.id} name={agent.name} onRemove={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
