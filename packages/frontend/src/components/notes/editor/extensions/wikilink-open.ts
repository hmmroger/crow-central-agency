import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { createNote, unwrapResponse } from "../../../../services/api-client.js";
import { queryClient } from "../../../../services/query-client.js";
import { noteKeys } from "../../../../services/query-keys.js";
import { useAppStore } from "../../../../stores/app-store.js";
import { getErrorMessage } from "../../../../utils/error-message.js";
import { planWikilinkCreation, toWikilinkCreationKey } from "../../../../utils/wikilink-create.js";
import type { WikilinkCreatePlan } from "../../../../utils/wikilink-create.types.js";
import { resolveWikilinkTarget } from "../../../../utils/wikilink-resolver.js";
import { getCurrentNote } from "./current-note-state.js";
import { showEditorError } from "./editor-error-state.js";
import { isOpenModifierHeld, PRIMARY_BUTTON } from "./link-open.js";
import { getNotesTree } from "./notes-tree-state.js";
import { WIKILINK_CLASS, WIKILINK_TARGET_ATTRIBUTE } from "./wikilink-syntax.js";

async function createPlannedNote(plan: WikilinkCreatePlan): Promise<NoteMetadata> {
  let parentId = plan.parentId;

  for (const name of plan.missingFolderNames) {
    parentId = unwrapResponse(await createNote({ parentId, name, entityType: ENTITY_TYPE.NOTE_FOLDER })).id;
  }

  return unwrapResponse(await createNote({ parentId, name: plan.noteName, entityType: ENTITY_TYPE.NOTE }));
}

/** Ctrl/Cmd + click on a wikilink opens the note it names, or creates that note when it names nothing. */
class WikilinkOpenPlugin {
  private isDestroyed = false;
  private readonly creatingKeys = new Set<string>();

  constructor(private readonly view: EditorView) {}

  public destroy(): void {
    this.isDestroyed = true;
  }

  public openUnderPointer(event: MouseEvent): boolean {
    if (!isOpenModifierHeld(event) || event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
      return false;
    }

    const target = event.target.closest(`.${WIKILINK_CLASS}`)?.getAttribute(WIKILINK_TARGET_ATTRIBUTE);

    if (!target) {
      return false;
    }

    const note = resolveWikilinkTarget(getNotesTree(this.view.state), target);

    if (note?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      return false;
    }

    event.preventDefault();

    if (note) {
      useAppStore.getState().goToNote(note.id);
    } else {
      void this.createAndOpen(target);
    }

    return true;
  }

  private async createAndOpen(target: string): Promise<void> {
    const { state } = this.view;
    const plan = planWikilinkCreation(getNotesTree(state), target, getCurrentNote(state));

    if (!plan) {
      return;
    }

    const creationKey = toWikilinkCreationKey(plan);

    if (this.creatingKeys.has(creationKey)) {
      return;
    }

    this.creatingKeys.add(creationKey);

    try {
      const note = await createPlannedNote(plan);
      // Opening waits for the refreshed tree, so the new note is there to show.
      await queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
      useAppStore.getState().goToNote(note.id);
    } catch (error) {
      // Folders made before the failure are real, so the tree still needs a refresh.
      void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });

      if (!this.isDestroyed) {
        showEditorError(this.view, getErrorMessage(error));
      }
    } finally {
      this.creatingKeys.delete(creationKey);
    }
  }
}

const wikilinkOpenPlugin = ViewPlugin.fromClass(WikilinkOpenPlugin);

/** Opens or creates the note behind a wikilink under a Ctrl/Cmd + primary click; table cells share it. */
export function openWikilinkUnderPointer(event: MouseEvent, view: EditorView): boolean {
  return view.plugin(wikilinkOpenPlugin)?.openUnderPointer(event) ?? false;
}

export function wikilinkOpen(): Extension {
  return wikilinkOpenPlugin;
}
