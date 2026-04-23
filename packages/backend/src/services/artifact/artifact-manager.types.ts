import type { AgentTaskSource, ArtifactContentType, ArtifactType } from "@crow-central-agency/shared";

export interface ReadArtifactOptions {
  useAdapter?: boolean;
}

export interface WriteArtifactOptions {
  createdBy: AgentTaskSource;
  type?: ArtifactType;
  contentType?: ArtifactContentType;
}

export interface ArtifactListOptions {
  type?: ArtifactType;
}

export interface ArtifactAdapter {
  convertArtifact: (artifactInput: Buffer) => Promise<string>;
}
