import type {
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationTagCatalogEntry,
  TagId,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentTag } from "./models.ts";
import { scopeTag } from "./models.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import { arrayElementsEqual } from "./entities.ts";

const EMPTY_TAGS: ReadonlyArray<OrchestrationTagCatalogEntry> = Object.freeze([]);
const EMPTY_TAG_INDEX: ReadonlyMap<TagId, OrchestrationTagCatalogEntry> = new Map();

export function createEnvironmentTagAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentTagsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<OrchestrationTagCatalogEntry> =>
        get(input.snapshotAtom(environmentId))?.tags ?? EMPTY_TAGS,
    ).pipe(Atom.withLabel(`environment-tags:${environmentId}`)),
  );

  const environmentTagIndexAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): ReadonlyMap<TagId, OrchestrationTagCatalogEntry> => {
      const tags = get(environmentTagsAtom(environmentId));
      if (tags.length === 0) {
        return EMPTY_TAG_INDEX;
      }
      return new Map(tags.map((tag) => [tag.id, tag] as const));
    }).pipe(Atom.withLabel(`environment-tag-index:${environmentId}`)),
  );

  const scopedEnvironmentTagsAtom = Atom.family((environmentId: EnvironmentId) => {
    let previousSource: ReadonlyArray<OrchestrationTagCatalogEntry> = EMPTY_TAGS;
    let previousValue: ReadonlyArray<EnvironmentTag> = [];
    return Atom.make((get) => {
      const source = get(environmentTagsAtom(environmentId));
      if (source === previousSource) {
        return previousValue;
      }
      previousSource = source;
      previousValue = source.map((tag) => scopeTag(environmentId, tag));
      return previousValue;
    }).pipe(Atom.withLabel(`environment-tags-scoped:${environmentId}`));
  });

  let previousTags: ReadonlyArray<EnvironmentTag> = [];
  const tagsAtom = Atom.make((get) => {
    const next: EnvironmentTag[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      next.push(...get(scopedEnvironmentTagsAtom(environmentId)));
    }
    if (arrayElementsEqual(previousTags, next)) {
      return previousTags;
    }
    previousTags = next;
    return previousTags;
  }).pipe(Atom.withLabel("environment-tag-list"));

  return {
    environmentTagsAtom,
    environmentTagIndexAtom,
    tagsAtom,
  };
}
