import { EDITORS, EditorId, LocalApi } from "@t3tools/contracts";
import { selectableEditorIds } from "@t3tools/shared/editors";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

export { selectableEditorIds };

const LAST_EDITOR_KEY = "t3code:last-editor";

function fallbackEditor(selectableEditors: ReadonlyArray<EditorId>): EditorId | null {
  return (
    EDITORS.find((editor) => selectableEditors.includes(editor.id))?.id ??
    selectableEditors[0] ??
    null
  );
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

export async function openInPreferredEditor(api: LocalApi, targetPath: string): Promise<EditorId> {
  const { availableEditors, settings } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(
    selectableEditorIds(availableEditors, settings.customEditors),
  );
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
