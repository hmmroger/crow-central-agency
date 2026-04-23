import { useEffect, useMemo, useState } from "react";
import { ENTITY_TYPE, RELATIONSHIP_TYPE, type EntityType } from "@crow-central-agency/shared";
import { useAgentsQuery } from "../../../hooks/queries/use-agents-query.js";
import { useCirclesQuery } from "../../../hooks/queries/use-circles-query.js";
import { useCircleMembersQuery } from "../../../hooks/queries/use-circle-members-query.js";
import { useCreateRelationship, useDeleteRelationship } from "../../../hooks/queries/use-relationship-mutations.js";
import type { ApiError } from "../../../services/api-client.types.js";

/** A selectable entity (agent or circle) for the membership editor */
export interface MemberOption {
  entityId: string;
  entityType: EntityType;
  name: string;
}

interface CircleMembershipEditorResult {
  /** Available agents for selection (excludes system agents) */
  agentOptions: MemberOption[];
  /** Available circles for selection (excludes self and system circles) */
  circleOptions: MemberOption[];
  /** Currently selected member IDs (local state) */
  selectedMemberIds: Set<string>;
  /** Toggle a member's selection */
  handleToggleMember: (entityId: string) => void;
  /** Whether the selection differs from the persisted state */
  hasChanges: boolean;
  /** Apply the membership diff (add/remove relationships) */
  applyMembershipChanges: (circleId: string) => Promise<void>;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Error from a failed membership mutation */
  membershipError: ApiError | undefined;
}

/**
 * Shared hook for managing circle membership selection and persistence.
 * Supports both agent and circle members.
 * Tracks local toggle state, syncs from server on load, and diffs on save.
 *
 * @param circleId - The circle to manage. Pass empty string when creating a new circle.
 * @param enabled - Whether to fetch current members. Set false for create mode.
 */
export function useCircleMembershipEditor(circleId: string, enabled: boolean): CircleMembershipEditorResult {
  const createRelationship = useCreateRelationship();
  const deleteRelationship = useDeleteRelationship();
  const { data: allAgents = [] } = useAgentsQuery();
  const { data: allCircles = [] } = useCirclesQuery();
  const { data: members = [] } = useCircleMembersQuery(circleId, enabled);

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [initialMemberIds, setInitialMemberIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Sync when the actual member IDs change (initial fetch or external update)
  useEffect(() => {
    const currentIds = new Set(members.map((m) => m.entityId));

    setInitialMemberIds((prev) => {
      if (prev.size === currentIds.size && [...prev].every((id) => currentIds.has(id))) {
        return prev;
      }

      setSelectedMemberIds(new Set(currentIds));
      return currentIds;
    });
  }, [members]);

  /** Map member entityId → { relationshipId, entityType } for diffing on save */
  const memberRelationshipMap = useMemo(() => {
    const map = new Map<string, { relationshipId: string; entityType: EntityType }>();
    for (const member of members) {
      map.set(member.entityId, { relationshipId: member.relationshipId, entityType: member.entityType });
    }

    return map;
  }, [members]);

  /** Map entityId → entityType for all selectable entities (used when creating new relationships) */
  const entityTypeMap = useMemo(() => {
    const map = new Map<string, EntityType>();
    for (const agent of allAgents) {
      map.set(agent.id, ENTITY_TYPE.AGENT);
    }

    for (const circle of allCircles) {
      map.set(circle.id, ENTITY_TYPE.AGENT_CIRCLE);
    }

    return map;
  }, [allAgents, allCircles]);

  const agentOptions: MemberOption[] = useMemo(
    () =>
      allAgents
        .filter((agent) => !agent.isSystemAgent)
        .map((agent) => ({ entityId: agent.id, entityType: ENTITY_TYPE.AGENT, name: agent.name })),
    [allAgents]
  );

  const circleOptions: MemberOption[] = useMemo(
    () =>
      allCircles
        .filter((circle) => !circle.isSystemCircle && circle.id !== circleId)
        .map((circle) => ({
          entityId: circle.id,
          entityType: ENTITY_TYPE.AGENT_CIRCLE,
          name: circle.name,
        })),
    [allCircles, circleId]
  );

  const hasChanges = useMemo(() => {
    if (selectedMemberIds.size !== initialMemberIds.size) {
      return true;
    }

    return [...selectedMemberIds].some((id) => !initialMemberIds.has(id));
  }, [selectedMemberIds, initialMemberIds]);

  const handleToggleMember = (entityId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }

      return next;
    });
  };

  const applyMembershipChanges = async (targetCircleId: string): Promise<void> => {
    setIsSaving(true);
    try {
      const membersToAdd = [...selectedMemberIds].filter((id) => !initialMemberIds.has(id));
      const membersToRemove = [...initialMemberIds].filter((id) => !selectedMemberIds.has(id));

      for (const entityId of membersToAdd) {
        const entityType = entityTypeMap.get(entityId);
        if (!entityType) {
          throw new Error(`Unknown entity type for member ${entityId}`);
        }

        await createRelationship.mutateAsync({
          sourceEntityId: targetCircleId,
          sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
          targetEntityId: entityId,
          targetEntityType: entityType,
          relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
        });
      }

      for (const entityId of membersToRemove) {
        const entry = memberRelationshipMap.get(entityId);
        if (entry) {
          await deleteRelationship.mutateAsync(entry.relationshipId);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const membershipError = createRelationship.error ?? deleteRelationship.error ?? undefined;

  return {
    agentOptions,
    circleOptions,
    selectedMemberIds,
    handleToggleMember,
    hasChanges,
    applyMembershipChanges,
    isSaving,
    membershipError,
  };
}
