import { FragmentKindSchema, type FragmentKind } from "@crow-central-agency/shared";
import type { DocumentPaletteSource } from "./document-palette.types.js";

function isFragmentKind(tag: string): tag is FragmentKind {
  return FragmentKindSchema.safeParse(tag).success;
}

/** Fragment search hits carry their kind as a tag */
export function getFragmentHitKind(document: DocumentPaletteSource): FragmentKind | undefined {
  return document.tags?.find(isFragmentKind);
}
