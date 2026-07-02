import { EDITORS, EditorId, EnvironmentId } from "@t3tools/contracts";
import { selectableEditorIds } from "@t3tools/shared/editors";
import {
  mapAtomCommandResult,
  type AtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useCallback, useMemo } from "react";
import { shellEnvironment } from "./state/shell";
import { useAtomCommand } from "./state/use-atom-command";

export { selectableEditorIds };

const LAST_EDITOR_KEY = "t3code:last-editor";

function fallbackEditor(selectableEditors: ReadonlyArray<EditorId>): EditorId | null {
  return (
    EDITORS.find((editor) => selectableEditors.includes(editor.id))?.id ??
    selectableEditors[0] ??
    null
  );
}

export class PreferredEditorEnvironmentRequiredError extends Schema.TaggedErrorClass<PreferredEditorEnvironmentRequiredError>()(
  "PreferredEditorEnvironmentRequiredError",
  {
    targetPath: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot open ${this.targetPath} because no environment is selected.`;
  }
}

export class PreferredEditorUnavailableError extends Schema.TaggedErrorClass<PreferredEditorUnavailableError>()(
  "PreferredEditorUnavailableError",
  {
    environmentId: EnvironmentId,
    targetPath: Schema.String,
    availableEditorIds: Schema.Array(EditorId),
  },
) {
  override get message(): string {
    return `No available editor can open ${this.targetPath} in environment ${this.environmentId}.`;
  }
}

export function usePreferredEditor(selectableEditors: ReadonlyArray<EditorId>) {
  const [lastEditor, setLastEditor] = useLocalStorage(LAST_EDITOR_KEY, null, EditorId);

  const effectiveEditor = useMemo(() => {
    if (lastEditor && selectableEditors.includes(lastEditor)) return lastEditor;
    return fallbackEditor(selectableEditors);
  }, [lastEditor, selectableEditors]);

  return [effectiveEditor, setLastEditor] as const;
}

export function resolveAndPersistPreferredEditor(
  selectableEditors: ReadonlyArray<EditorId>,
): EditorId | null {
  const stored = getLocalStorageItem(LAST_EDITOR_KEY, EditorId);
  if (stored && selectableEditors.includes(stored)) return stored;
  const editor = fallbackEditor(selectableEditors);
  if (editor) setLocalStorageItem(LAST_EDITOR_KEY, editor, EditorId);
  return editor;
}

export function useOpenInPreferredEditor(
  environmentId: EnvironmentId | null,
  availableEditors: readonly EditorId[],
) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, {
    reportFailure: false,
  });
  type OpenInEditorError = AtomCommandFailure<Awaited<ReturnType<typeof openInEditor>>>;

  return useCallback(
    async (
      targetPath: string,
    ): Promise<
      AtomCommandResult<
        EditorId,
        | OpenInEditorError
        | PreferredEditorEnvironmentRequiredError
        | PreferredEditorUnavailableError
      >
    > => {
      if (environmentId === null) {
        return AsyncResult.failure(
          Cause.fail(
            new PreferredEditorEnvironmentRequiredError({
              targetPath,
            }),
          ),
        );
      }
      const editor = resolveAndPersistPreferredEditor(availableEditors);
      if (!editor) {
        return AsyncResult.failure(
          Cause.fail(
            new PreferredEditorUnavailableError({
              environmentId,
              targetPath,
              availableEditorIds: availableEditors,
            }),
          ),
        );
      }
      const result = await openInEditor({
        environmentId,
        input: {
          cwd: targetPath,
          editor,
        },
      });
      return mapAtomCommandResult(result, () => editor);
    },
    [availableEditors, environmentId, openInEditor],
  );
}
