import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  BASE_CIRCLE_ID,
  BASE_CIRCLE_NAME,
  AgentCircleSchema,
  type AgentCircle,
  type Relationship,
  type CreateAgentCircleInput,
  type UpdateAgentCircleInput,
  type CreateRelationshipInput,
  type EntityType,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentCircleManagerEvents } from "./agent-circle-manager.types.js";
import type { QueryRelationshipOptions } from "./relationship-manager.types.js";
import { relationshipMatchesQuery, type RelationshipManager } from "./relationship-manager.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { generateId, SYSTEM_AGENT_IDS } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "agent-circle-manager" });

/** Object store table name for agent circles */
export const CIRCLE_STORE_TABLE = "agent-circles";

/**
 * Manages AgentCircle entities and circle membership semantics.
 * Edge persistence and queries are delegated to the RelationshipManager;
 * system agents are virtually visible in all circles.
 */
export class AgentCircleManager extends EventBus<AgentCircleManagerEvents> {
  private circles = new Map<string, AgentCircle>();
  private virtualRelationships = new Map<string, Relationship>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly relationshipManager: RelationshipManager,
    private readonly broadcaster: WsBroadcaster
  ) {
    super();
  }

  /**
   * Load circles from the object store.
   * Ensures the Base Circle exists.
   */
  public async initialize(): Promise<void> {
    // Load circles
    const circleEntries = await this.store.getAll<AgentCircle>(CIRCLE_STORE_TABLE);
    for (const entry of circleEntries) {
      const result = AgentCircleSchema.safeParse(entry.value);
      if (result.success) {
        this.circles.set(result.data.id, result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid circle in object store");
      }
    }

    // Ensure Base Circle exists
    await this.ensureBaseCircle();

    for (const circle of this.circles.values()) {
      this.addSystemAgentVirtualRelationships(circle.id);
    }

    log.info({ circles: this.circles.size }, "AgentCircleManager initialized");
  }

  /** Get all circles */
  public getAllCircles(): AgentCircle[] {
    return Array.from(this.circles.values());
  }

  /**
   * Get a single circle by ID.
   * @throws AppError with CIRCLE_NOT_FOUND if the circle does not exist.
   */
  public getCircle(circleId: string): AgentCircle {
    const circle = this.circles.get(circleId);
    if (!circle) {
      throw new AppError(`Circle not found: ${circleId}`, APP_ERROR_CODES.CIRCLE_NOT_FOUND);
    }

    return circle;
  }

  /** Create a new agent circle */
  public async createCircle(input: CreateAgentCircleInput): Promise<AgentCircle> {
    const now = Date.now();
    const circle: AgentCircle = {
      id: generateId(),
      name: input.name,
      convention: input.convention,
      displayOrder: input.displayOrder,
      createdTimestamp: now,
      updatedTimestamp: now,
    };

    this.circles.set(circle.id, circle);
    await this.store.set(CIRCLE_STORE_TABLE, circle.id, circle);
    this.addSystemAgentVirtualRelationships(circle.id);

    log.info({ circleId: circle.id, name: circle.name }, "Circle created");
    this.emit("circleCreated", { circle });
    this.broadcaster.broadcast({ type: "circle_created", circle });

    return circle;
  }

  /** Update an existing circle */
  public async updateCircle(circleId: string, input: UpdateAgentCircleInput): Promise<AgentCircle> {
    const existing = this.getCircle(circleId);

    const now = Date.now();
    const updated: AgentCircle = {
      ...existing,
      ...input,
      // Empty string clears optional fields
      convention: input.convention !== undefined ? input.convention || undefined : existing.convention,
      id: existing.id,
      createdTimestamp: existing.createdTimestamp,
      updatedTimestamp: now,
    };

    this.circles.set(circleId, updated);
    await this.store.set(CIRCLE_STORE_TABLE, circleId, updated);

    log.info({ circleId, name: updated.name }, "Circle updated");
    this.emit("circleUpdated", { circle: updated });
    this.broadcaster.broadcast({ type: "circle_updated", circle: updated });

    return updated;
  }

  /** Delete a circle and cascade-remove all its relationships */
  public async deleteCircle(circleId: string): Promise<void> {
    const existing = this.getCircle(circleId);
    this.assertMutableCircle(existing);

    // Remove all relationships involving this circle (as source or target)
    await this.removeRelationshipsForEntity(circleId);
    this.removeSystemAgentVirtualRelationships(circleId);

    this.circles.delete(circleId);
    await this.store.delete(CIRCLE_STORE_TABLE, circleId);

    log.info({ circleId, name: existing.name }, "Circle deleted");
    this.emit("circleDeleted", { circleId });
    this.broadcaster.broadcast({ type: "circle_deleted", circleId });
  }

  /** Get all relationships, including virtual system-agent memberships */
  public getAllRelationships(): Relationship[] {
    return this.relationshipManager.getAllRelationships().concat(Array.from(this.virtualRelationships.values()));
  }

  public queryRelationships(options: QueryRelationshipOptions): Relationship[] {
    return this.getAllRelationships().filter((relationship) => relationshipMatchesQuery(relationship, options));
  }

  /**
   * Get a single relationship by ID.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if not found.
   */
  public getRelationship(relationshipId: string): Relationship {
    return this.relationshipManager.getRelationship(relationshipId);
  }

  /** Create a relationship between entities */
  public async createRelationship(input: CreateRelationshipInput): Promise<Relationship> {
    // Checked here (ahead of the cycle check) to preserve error ordering;
    // RelationshipManager re-checks independently for non-circle callers.
    if (input.sourceEntityId === input.targetEntityId) {
      throw new AppError(
        "Cannot create a relationship from an entity to itself",
        APP_ERROR_CODES.DUPLICATE_RELATIONSHIP
      );
    }

    // Prevent duplicates, including against virtual system-agent memberships
    this.assertNoDuplicateRelationship(input);

    // Cycle detection for circle-to-circle memberships
    if (
      input.sourceEntityType === ENTITY_TYPE.AGENT_CIRCLE &&
      input.targetEntityType === ENTITY_TYPE.AGENT_CIRCLE &&
      input.relationshipType === RELATIONSHIP_TYPE.MEMBERSHIP
    ) {
      this.assertNoCycle(input.sourceEntityId, input.targetEntityId);
    }

    const relationship = await this.relationshipManager.createRelationship(input);

    this.emit("relationshipCreated", { relationship });
    this.broadcaster.broadcast({ type: "relationship_created", relationship });

    return relationship;
  }

  /**
   * Delete a relationship by ID.
   * Prevents removing an agent's last circle membership.
   */
  public async deleteRelationship(relationshipId: string): Promise<void> {
    const relationship = this.getRelationship(relationshipId);

    // Guard: cannot remove an agent's last circle membership
    if (
      relationship.targetEntityType === ENTITY_TYPE.AGENT &&
      relationship.relationshipType === RELATIONSHIP_TYPE.MEMBERSHIP
    ) {
      const agentCircleCount = this.getCirclesForEntity(relationship.targetEntityId, ENTITY_TYPE.AGENT).length;
      if (agentCircleCount <= 1) {
        throw new AppError("Cannot remove an agent's last circle membership", APP_ERROR_CODES.LAST_CIRCLE_MEMBERSHIP);
      }
    }

    await this.relationshipManager.deleteRelationship(relationshipId);

    this.emit("relationshipDeleted", { relationshipId });
    this.broadcaster.broadcast({ type: "relationship_deleted", relationshipId });
  }

  // ---------------------------------------------------------------------------
  // Query / Resolver methods
  // ---------------------------------------------------------------------------

  /** Get all circles that an entity is a member of */
  public getCirclesForEntity(entityId: string, entityType: EntityType): AgentCircle[] {
    const circles: AgentCircle[] = [];

    for (const relationship of this.queryRelationships({
      targetEntityId: entityId,
      targetEntityType: entityType,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    })) {
      const circle = this.circles.get(relationship.sourceEntityId);
      if (circle) {
        circles.push(circle);
      }
    }

    return circles;
  }

  /**
   * Get direct members of a circle from stored relationships.
   * @throws AppError with CIRCLE_NOT_FOUND if the circle does not exist.
   */
  public getCircleMembers(
    circleId: string
  ): Array<{ relationshipId: string; entityId: string; entityType: EntityType }> {
    this.getCircle(circleId);

    const memberIds = new Set<string>();
    const members: Array<{ relationshipId: string; entityId: string; entityType: EntityType }> = [];

    for (const relationship of this.queryRelationships({
      sourceEntityId: circleId,
      sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    })) {
      if (!memberIds.has(relationship.targetEntityId)) {
        memberIds.add(relationship.targetEntityId);
        members.push({
          relationshipId: relationship.id,
          entityId: relationship.targetEntityId,
          entityType: relationship.targetEntityType,
        });
      }
    }

    return members;
  }

  /**
   * Get all agent IDs visible to the given agent through circle memberships.
   * Walks up through parent circles and down through sub-circles.
   * Always includes system agent IDs. Excludes the querying agent itself.
   */
  public getVisibleAgentIds(agentId: string): Set<string> {
    const visibleAgentIds = new Set<string>();
    const visitedCircles = new Set<string>();

    const agentCircles = this.getCirclesForEntity(agentId, ENTITY_TYPE.AGENT);
    for (const circle of agentCircles) {
      this.collectVisibleAgents(circle.id, visibleAgentIds, visitedCircles);
    }

    // Exclude the querying agent
    visibleAgentIds.delete(agentId);

    return visibleAgentIds;
  }

  /** Check whether agentId can see targetAgentId through circle memberships */
  public isAgentVisible(agentId: string, targetAgentId: string): boolean {
    // Self is always visible
    if (agentId === targetAgentId) {
      return true;
    }

    const visibleAgentIds = new Set<string>();
    const visitedCircles = new Set<string>();

    const agentCircles = this.getCirclesForEntity(agentId, ENTITY_TYPE.AGENT);
    for (const circle of agentCircles) {
      this.collectVisibleAgents(circle.id, visibleAgentIds, visitedCircles);
      if (visibleAgentIds.has(targetAgentId)) {
        return true;
      }
    }

    return false;
  }

  /** Remove all relationships involving an entity and emit events for each */
  public async removeRelationshipsForEntity(entityId: string): Promise<void> {
    const removedIds = await this.relationshipManager.removeRelationshipsForEntity(entityId);

    for (const relationshipId of removedIds) {
      this.emit("relationshipDeleted", { relationshipId });
      this.broadcaster.broadcast({ type: "relationship_deleted", relationshipId });
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Recursively collect all visible agent IDs from a circle.
   * Walks down into sub-circles and up into parent circles.
   */
  private collectVisibleAgents(circleId: string, agentIds: Set<string>, visitedCircles: Set<string>): void {
    if (visitedCircles.has(circleId)) {
      return;
    }

    visitedCircles.add(circleId);

    const members = this.getCircleMembers(circleId);
    for (const member of members) {
      if (member.entityType === ENTITY_TYPE.AGENT) {
        agentIds.add(member.entityId);
      } else if (member.entityType === ENTITY_TYPE.AGENT_CIRCLE) {
        this.collectVisibleAgents(member.entityId, agentIds, visitedCircles);
      }
    }

    // Walk up: if this circle is a member of parent circles, visit them too
    for (const relationship of this.queryRelationships({
      targetEntityId: circleId,
      targetEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    })) {
      this.collectVisibleAgents(relationship.sourceEntityId, agentIds, visitedCircles);
    }
  }

  /** Ensure the Base Circle exists in the store */
  private async ensureBaseCircle(): Promise<void> {
    if (this.circles.has(BASE_CIRCLE_ID)) {
      return;
    }

    const now = Date.now();
    const baseCircle: AgentCircle = {
      id: BASE_CIRCLE_ID,
      name: BASE_CIRCLE_NAME,
      isSystemCircle: true,
      createdTimestamp: now,
      updatedTimestamp: now,
    };

    this.circles.set(BASE_CIRCLE_ID, baseCircle);
    await this.store.set(CIRCLE_STORE_TABLE, BASE_CIRCLE_ID, baseCircle);

    log.info("Base Circle created");
  }

  /** Remove virtual system agent relationships for a circle */
  private removeSystemAgentVirtualRelationships(circleId: string): void {
    for (const agentId of SYSTEM_AGENT_IDS) {
      this.virtualRelationships.delete(`system_${circleId}_${agentId}`);
    }
  }

  /** Add virtual membership relationships for all system agents to a circle */
  private addSystemAgentVirtualRelationships(circleId: string): void {
    const createdTimestamp = Date.now();
    for (const agentId of SYSTEM_AGENT_IDS) {
      const relId = `system_${circleId}_${agentId}`;
      this.virtualRelationships.set(relId, {
        id: relId,
        sourceEntityId: circleId,
        sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
        targetEntityId: agentId,
        targetEntityType: ENTITY_TYPE.AGENT,
        relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
        createdTimestamp,
      });
    }
  }

  /** Throw if the circle is a system circle and cannot be modified or deleted */
  private assertMutableCircle(circle: AgentCircle): void {
    if (circle.isSystemCircle) {
      throw new AppError(`System circle "${circle.name}" cannot be modified`, APP_ERROR_CODES.CIRCLE_IMMUTABLE);
    }
  }

  /** Check that no identical relationship already exists, including virtual ones */
  private assertNoDuplicateRelationship(input: CreateRelationshipInput): void {
    const duplicates = this.queryRelationships(input);
    if (duplicates.length > 0) {
      throw new AppError("Duplicate relationship already exists", APP_ERROR_CODES.DUPLICATE_RELATIONSHIP);
    }
  }

  /**
   * Detect if adding a circle-to-circle membership (source contains target) would create a cycle.
   * The proposed edge would close a cycle if sourceCircleId is already reachable from
   * targetCircleId through existing circle-to-circle membership edges.
   */
  private assertNoCycle(sourceCircleId: string, targetCircleId: string): void {
    const wouldCycle = this.relationshipManager.canReach(targetCircleId, sourceCircleId, {
      sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      targetEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    });

    if (wouldCycle) {
      throw new AppError(
        "Adding this membership would create a circular dependency",
        APP_ERROR_CODES.CIRCULAR_MEMBERSHIP
      );
    }
  }
}
