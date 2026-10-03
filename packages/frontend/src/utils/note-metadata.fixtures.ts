import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";

/** Test fixtures: ids follow the backend's shape, the lower-cased path with `/` as `:`. */
function toId(path: string): string {
  return path.split("/").join(":").toLowerCase();
}

function toParentId(path: string): string | undefined {
  const separatorIndex = path.lastIndexOf("/");

  return separatorIndex === -1 ? undefined : toId(path.slice(0, separatorIndex));
}

export function folderFixture(path: string): NoteMetadata {
  return {
    id: toId(path),
    entityType: ENTITY_TYPE.NOTE_FOLDER,
    name: path.split("/").pop() ?? path,
    path,
    parentId: toParentId(path),
    updatedTimestamp: 0,
    isReadOnly: true,
    isTrashed: false,
  };
}

export function noteFixture(
  path: string,
  name: string,
  contentType: NoteContentType = NOTE_CONTENT_TYPE.TEXT,
  updatedTimestamp = 0
): NoteMetadata {
  return {
    id: toId(path),
    entityType: ENTITY_TYPE.NOTE,
    name,
    path,
    parentId: toParentId(path),
    updatedTimestamp,
    isReadOnly: contentType !== NOTE_CONTENT_TYPE.TEXT,
    isTrashed: false,
    contentType,
    size: 0,
  };
}
