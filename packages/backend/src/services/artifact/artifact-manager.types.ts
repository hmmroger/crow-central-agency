import type {
  AgentTaskSource,
  ArtifactContentType,
  ArtifactMetadata,
  ArtifactType,
  EntityType,
} from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

export interface ArtifactManagerEvents extends EventMap {
  artifactSaved: { metadata: ArtifactMetadata };
  artifactDeleted: { metadata: ArtifactMetadata };
}

export interface ArtifactContentMatch {
  lineNumber: number;
  lineContent: string;
  matchIndex: number;
}

export interface ArtifactContentFindResult {
  found: boolean;
  matchCount: number;
  matches: ArtifactContentMatch[];
}

export interface ReadArtifactOptions {
  useAdapter?: boolean;
}

export interface ReadArtifactResult {
  content: string | Buffer;
  metadata: ArtifactMetadata;
}

export interface WriteArtifactOptions {
  createdBy: AgentTaskSource;
  type?: ArtifactType;
  contentType?: ArtifactContentType;
  tags?: string[];
}

/** Identifies an artifact-owning entity (an agent's own folder or a circle). */
export interface ArtifactLocation {
  entityType: EntityType;
  entityId: string;
}

export interface MoveArtifactOptions {
  destinationFilename?: string;
  movedBy: AgentTaskSource;
}

export interface UpdateArtifactOptions {
  content?: string | Buffer;
  addTags?: string[];
  removeTags?: string[];
  expectedUpdatedTimestamp?: number;
}

export interface ArtifactListOptions {
  type?: ArtifactType;
  tags?: string[];
}

export interface ArtifactAdapter {
  convertArtifact: (artifactInput: Buffer) => Promise<string>;
}
