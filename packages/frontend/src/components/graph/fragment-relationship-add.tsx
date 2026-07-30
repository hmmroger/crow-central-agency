import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_DIRECTION,
  RELATIONSHIP_TYPE,
  type CreateRelationshipInput,
  type FragmentKind,
  type FragmentRelationshipEntity,
  type RelationshipDirection,
} from "@crow-central-agency/shared";
import { cn } from "../../utils/cn.js";
import { ComboboxDropdown } from "../common/combobox-dropdown.js";
import { ComboboxOption } from "../common/combobox-option.js";
import { useComboboxDropdown } from "../common/use-combobox-dropdown.js";
import { useCreateRelationship } from "../../hooks/queries/use-relationship-mutations.js";
import { useFragmentRelationshipCandidatesQuery } from "../../hooks/queries/use-fragment-relationship-candidates-query.js";
import { FragmentRelationshipDirectionButton } from "./fragment-relationship-direction-button.js";
import { KIND_LABEL } from "./fragment-kind-label.js";

interface FragmentRelationshipAddProps {
  fragmentId: string;
  kind?: FragmentKind;
}

/** Direction options presented to the user as the counterpart's role, TARGET first (the default) */
const DIRECTION_OPTIONS: ReadonlyArray<{ direction: RelationshipDirection; label: string }> = [
  { direction: RELATIONSHIP_DIRECTION.TARGET, label: "Parent" },
  { direction: RELATIONSHIP_DIRECTION.SOURCE, label: "Child" },
];

/** A KNOWLEDGE fragment is a leaf: it can gain a parent but never a child */
const CHILD_DISABLED_REASON = "Knowledge fragments can't have children";

function candidateLabel(candidate: FragmentRelationshipEntity): string {
  return candidate.entityType === ENTITY_TYPE.AGENT ? candidate.name : candidate.cue;
}

/** Place the open fragment and the picked candidate on the sides the direction implies */
function composeCreateInput(
  fragmentId: string,
  direction: RelationshipDirection,
  candidate: FragmentRelationshipEntity
): CreateRelationshipInput {
  if (direction === RELATIONSHIP_DIRECTION.TARGET) {
    const relationshipType =
      candidate.entityType === ENTITY_TYPE.AGENT ? RELATIONSHIP_TYPE.ASSOCIATION : RELATIONSHIP_TYPE.LINK;

    return {
      sourceEntityId: candidate.id,
      sourceEntityType: candidate.entityType,
      targetEntityId: fragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType,
    };
  }

  // SOURCE: the open fragment is the parent and the candidate (always a fragment) its child
  return {
    sourceEntityId: fragmentId,
    sourceEntityType: ENTITY_TYPE.FRAGMENT,
    targetEntityId: candidate.id,
    targetEntityType: ENTITY_TYPE.FRAGMENT,
    relationshipType: RELATIONSHIP_TYPE.LINK,
  };
}

/**
 * The create flow pinned below a fragment's relationship list: pick a direction
 * (add a parent or a child), then type-ahead to a candidate. Selecting a
 * candidate composes and submits the relationship; the new edge arrives back
 * through the graph cache. Candidates and their kind/cycle exclusions are
 * resolved by the backend, so the picker only ever lists valid options.
 */
export function FragmentRelationshipAdd({ fragmentId, kind }: FragmentRelationshipAddProps) {
  const [direction, setDirection] = useState<RelationshipDirection>(RELATIONSHIP_DIRECTION.TARGET);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const childDisabled = kind === FRAGMENT_KIND.KNOWLEDGE;
  const createRelationship = useCreateRelationship();
  const { data: candidates = [] } = useFragmentRelationshipCandidatesQuery(fragmentId, direction, true);

  const options = useMemo(() => {
    const needle = inputValue.trim().toLowerCase();
    if (needle.length === 0) {
      return candidates;
    }

    return candidates.filter((candidate) => candidateLabel(candidate).toLowerCase().includes(needle));
  }, [candidates, inputValue]);

  const selectOption = useCallback(
    (index: number) => {
      const candidate = options[index];
      if (!candidate) {
        return;
      }

      createRelationship.mutate(composeCreateInput(fragmentId, direction, candidate));
      setInputValue("");
      inputRef.current?.focus();
    },
    [options, createRelationship, fragmentId, direction]
  );

  const {
    isOpen,
    activeIndex,
    setActiveIndex,
    commitOption,
    open,
    toggle,
    handleKeyDown,
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

  const handleToggleOpen = useCallback(() => {
    toggle();
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen, toggle]);

  const handleSelectDirection = useCallback((next: RelationshipDirection) => {
    setDirection(next);
    setInputValue("");
  }, []);

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle px-4 pt-3">
      <div className="flex items-center gap-2">
        {DIRECTION_OPTIONS.map((option) => (
          <FragmentRelationshipDirectionButton
            key={option.direction}
            direction={option.direction}
            label={`Add ${option.label.toLowerCase()}`}
            isSelected={option.direction === direction}
            isDisabled={option.direction === RELATIONSHIP_DIRECTION.SOURCE && childDisabled}
            disabledReason={CHILD_DISABLED_REASON}
            onSelect={handleSelectDirection}
          />
        ))}
      </div>

      <div
        ref={referenceRef}
        {...referenceProps}
        onBlur={handleContainerBlur}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-surface-inset px-2 py-1 transition-colors",
          isOpen ? "border-border-focus" : "border-border-subtle"
        )}
      >
        <Search className="h-3 w-3 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={open}
          placeholder="Search to link…"
          aria-label="Search relationship candidates"
          className="min-w-0 flex-1 bg-transparent text-xs text-text-base placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label={isOpen ? "Hide candidates" : "Browse candidates"}
          className="shrink-0 text-text-muted transition-colors hover:text-text-neutral"
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
          emptyMessage="No candidates to link"
        >
          {options.map((candidate, index) => {
            const previous = options[index - 1];
            const startsGroup = !previous || previous.entityType !== candidate.entityType;
            const groupLabel = candidate.entityType === ENTITY_TYPE.AGENT ? "Agents" : "Fragments";

            return (
              <div key={`${candidate.entityType}:${candidate.id}`}>
                {startsGroup && (
                  <div className="px-2 pb-0.5 pt-1.5 text-3xs uppercase tracking-wider text-text-muted">
                    {groupLabel}
                  </div>
                )}
                <ComboboxOption
                  index={index}
                  isActive={index === activeIndex}
                  onActivate={setActiveIndex}
                  onCommit={commitOption}
                >
                  {candidate.entityType === ENTITY_TYPE.FRAGMENT && (
                    <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-3xs uppercase tracking-wider text-text-muted">
                      {KIND_LABEL[candidate.kind]}
                    </span>
                  )}
                  <span className="truncate">{candidateLabel(candidate)}</span>
                </ComboboxOption>
              </div>
            );
          })}
        </ComboboxDropdown>
      )}

      {createRelationship.error && <p className="text-xs text-error">{createRelationship.error.message}</p>}
    </div>
  );
}
