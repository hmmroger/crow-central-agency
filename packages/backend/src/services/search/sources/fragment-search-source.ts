import type { Fragment } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../fragment/fragment-manager.js";
import {
  DATA_SOURCE_TYPE,
  GLOBAL_PROVENANCE_ID,
  type DocumentRef,
  type SearchDocument,
  type SearchIndexSink,
  type SearchSource,
} from "../document-search-service.types.js";

/** Indexes memory fragments: cue as title, body as text, kind as tag. */
export class FragmentSearchSource implements SearchSource {
  public readonly dataSourceTypes = [DATA_SOURCE_TYPE.FRAGMENT];

  constructor(private readonly fragmentManager: FragmentManager) {}

  public async *loadAll(): AsyncIterable<SearchDocument> {
    for (const fragment of await this.fragmentManager.getAllFragments()) {
      yield this.toDocument(fragment);
    }
  }

  public subscribe(sink: SearchIndexSink): void {
    this.fragmentManager.on("fragmentCreated", ({ fragment }) => sink.upsert(this.toDocument(fragment)));
    this.fragmentManager.on("fragmentUpdated", ({ fragment }) => sink.upsert(this.toDocument(fragment)));
    this.fragmentManager.on("fragmentDeleted", ({ fragmentId }) => sink.remove(this.toRef(fragmentId)));
  }

  private toDocument(fragment: Fragment): SearchDocument {
    return {
      ...this.toRef(fragment.id),
      title: fragment.cue,
      text: fragment.body,
      tags: [fragment.kind],
    };
  }

  private toRef(fragmentId: string): DocumentRef {
    return { documentId: fragmentId, dataSourceType: DATA_SOURCE_TYPE.FRAGMENT, provenanceId: GLOBAL_PROVENANCE_ID };
  }
}
