import type { AgentTaskSource, ArtifactContentType, ArtifactMetadata, ArtifactType } from "@crow-central-agency/shared";

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
