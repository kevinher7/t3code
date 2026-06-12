/**
 * Editors - Shared helpers for editor identifiers.
 *
 * Maps user-defined custom editor definitions to namespaced `EditorId`
 * values so they can flow through the same RPC/preference plumbing as
 * built-in editors without colliding with built-in ids.
 *
 * @module Editors
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
