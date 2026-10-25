/**
 * Maps user-defined custom editors to namespaced `EditorId`s so they share the
 * built-in editor RPC and preference paths without colliding with built-in ids.
 */
import {
  CUSTOM_EDITOR_ID_PREFIX,
  type CustomEditorDefinition,
  type CustomEditorId,
  type EditorId,
} from "@t3tools/contracts";

export function customEditorId(slug: CustomEditorDefinition["id"]): CustomEditorId {
  return `${CUSTOM_EDITOR_ID_PREFIX}${slug}`;
}

export function isCustomEditorId(editor: EditorId): editor is CustomEditorId {
  return editor.startsWith(CUSTOM_EDITOR_ID_PREFIX);
}

/**
 * Full list of editor ids a user can pick from: built-in editors detected on
 * the server plus all configured custom editors. Custom editors are not
 * availability-checked — the user opted into them explicitly, and a missing
 * command surfaces as a launch error instead of a silently hidden entry.
 */
export function selectableEditorIds(
  availableEditors: ReadonlyArray<EditorId>,
  customEditors: ReadonlyArray<CustomEditorDefinition>,
): ReadonlyArray<EditorId> {
  return [...availableEditors, ...customEditors.map((editor) => customEditorId(editor.id))];
}
