import type * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";
import {
  type CreateTagInput,
  type DeleteTagInput,
  type RenameTagInput,
  createTag,
  deleteTag,
  renameTag,
} from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export type { CreateTagInput, DeleteTagInput, RenameTagInput } from "../operations/commands.ts";

export function createTagEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const tagScheduler = createAtomCommandScheduler();
  const tagConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { tagId: string } }) =>
      JSON.stringify([environmentId, input.tagId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:tag:create",
      execute: (input: CreateTagInput) => createTag(input),
      scheduler: tagScheduler,
      concurrency: tagConcurrency,
    }),
    rename: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:tag:rename",
      execute: (input: RenameTagInput) => renameTag(input),
      scheduler: tagScheduler,
      concurrency: tagConcurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:tag:delete",
      execute: (input: DeleteTagInput) => deleteTag(input),
      scheduler: tagScheduler,
      concurrency: tagConcurrency,
    }),
  };
}
