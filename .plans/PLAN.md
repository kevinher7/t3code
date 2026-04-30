# Plan: Convert tag UI from inline chips to dropdown menus

## Context

The current implementation (just shipped on `feature/kevin/create_tag_filtering`) renders tags as a flex-wrap row of pill-shaped chips inside a dedicated `TAGS` section in the sidebar (Sidebar.tsx lines 2587–2637), positioned between the search row and the `PROJECTS` list. There is also no UI yet to **assign** tags to a project — that was deferred at the end of the original implementation.

Two problems with the current design:
1. **Visual weight**: a flex-wrap of chips can occupy several lines once the user has more than a handful of tags, pushing the project list down and crowding the sidebar.
2. **Missing assignment surface**: a user can create / rename / filter by tags, but cannot actually attach them to a project from the UI. The deferred "Edit tags…" affordance needs a home.

This plan replaces the inline chip list with a single **dropdown trigger** in the sidebar, and adds a **per-project tag-assignment dropdown** reachable from the project-row context menu. Both surfaces use the same Base-UI `Menu` + `MenuCheckboxItem` primitive that already powers the project context menu, so no new dependencies and minimal new component code.

## Options considered

| Option | Surface | Pros | Cons |
|---|---|---|---|
| **A. `Menu` + `MenuCheckboxItem`** *(recommended)* | Both filter & assignment | Already used by project context menu; native check indicators; trivial to add submenus for per-tag rename/delete; ships fast | No type-ahead search — gets cumbersome past ~30 tags |
| B. `Combobox` with `multiple={true}` + `ComboboxChips` | Both | Built-in search; chip rendering for selections; scales to hundreds of tags | Heavier visual footprint; one existing usage (`BranchToolbarBranchSelector`) is single-select only, so multi-select chip pattern would be a first |
| C. Custom `Popover` + `Autocomplete` (GitHub-style) | Both | Most flexible; familiar UX for power users | Most code to write; overlap with options A & B |

**Recommendation: Option A.** Tag count is expected to stay in the low double digits in practice; the existing `Menu` primitive already renders checkbox state and supports submenus, which the deferred per-tag rename/delete actions need anyway. We can switch to Option B later if tag counts grow large — the underlying state shape and server commands don't change.

## Recommended design — Option A

### Sidebar filter dropdown

Replace lines 2587–2637 of `apps/web/src/components/Sidebar.tsx` with a single trigger that summarises the current filter:

```
[ # Tags                ▾ ]        ← when no tags selected
[ # 2 tags filtered  · ✕ ▾ ]       ← when filter active (✕ clears)
```

Clicking the trigger opens a `MenuPopup`:

```
┌──────────────────────────┐
│ + New tag…               │   ← MenuItem, opens TagCreateDialog
│ ────────────             │   ← MenuSeparator
│ ☑ ml-research      ▶     │   ← MenuCheckboxItem with submenu
│ ☐ infrastructure   ▶     │
│ ☑ design           ▶     │
│ ────────────             │
│   Clear filter           │   ← MenuItem (disabled when no selection)
└──────────────────────────┘
```

Each tag row's right-arrow opens a `MenuSubPopup` with `Rename…` and `Delete` (destructive). This replaces the current right-click-on-chip behaviour with a discoverable affordance.

### Per-project assignment dropdown

In the existing project-row context menu (`handleProjectButtonContextMenu`, Sidebar.tsx ~line 1414–1500), add an `Edit tags ▶` entry between `Rename` and the grouping items. The submenu renders the same tag list as `MenuCheckboxItem`s, but the `checked` state reflects whether each tag is in `project.tags` and toggling fires a `project.meta.update` command with the new tag-id array.

The current project context menu uses Electron's native `api.contextMenu.show()` (not the React `Menu` primitive). Two implementation paths:

1. **Quick path**: keep the native menu for the outer items, but route `Edit tags…` to open a small React-rendered `Menu` anchored at the click coordinates. Lowest blast radius.
2. **Full path**: migrate the project context menu off the native API to the React `Menu`. Bigger refactor, out of scope for this change.

Plan goes with the quick path: an "Edit tags…" leaf in the native menu that opens a portaled React `Menu` at the click position.

## Critical files to modify

- `apps/web/src/components/Sidebar.tsx`
  - Replace TAGS chip row (lines 2587–2637) with the dropdown trigger + `Menu`.
  - Update `handleProjectButtonContextMenu` (~lines 1414–1500) to inject an `Edit tags…` entry that opens a React `Menu` portaled at click coords.
  - Remove `onTagChipToggle` / `onTagChipContextMenu` props now that chips are gone — replace with `onTagFilterToggle` / `onTagRename` / `onTagDelete` handlers passed into the new `<TagFilterMenu>` and `<ProjectTagAssignMenu>` subcomponents.
  - Add small new local components: `TagFilterMenu` (sidebar trigger + popup) and `ProjectTagAssignMenu` (project-context popup).

- `apps/web/src/components/Sidebar.logic.ts`
  - No changes to `filterProjectSnapshotsByTags` or `toggleTagFilterSelection` — these stay as-is.
  - Add `toggleProjectTagAssignment(project, tagId)` pure helper that returns the new tag-id array for a `project.meta.update` payload.

- `apps/web/src/uiStateStore.ts`
  - No state-shape changes. `projectTagFilter.selectedTagIds` and the existing reducers (`setProjectTagFilterSelection`, `clearProjectTagFilterTagId`) are reused.

- (No server changes.) The `tag.create` / `tag.rename` / `tag.delete` / `project.meta.update` commands all exist and are tested.

## Existing utilities to reuse

- `Menu`, `MenuTrigger`, `MenuPopup`, `MenuItem`, `MenuCheckboxItem`, `MenuSeparator`, `MenuSub`, `MenuSubTrigger`, `MenuSubPopup` — all from `apps/web/src/components/ui/menu.tsx`.
- `Tooltip` / `TooltipTrigger` / `TooltipPopup` — already in use for the existing `+` button.
- `selectTagsAcrossEnvironments` (`apps/web/src/store.ts` ~lines 1807–1820) — feeds the menu its tag list.
- `useUiStateStore.getState().projectTagFilter.selectedTagIds` and the `setProjectTagFilterSelection` / `clearProjectTagFilterTagId` actions.
- `filterProjectSnapshotsByTags` (`Sidebar.logic.ts`) — unchanged; the dropdown emits the same selection state into the same store.
- Existing `TagCreateDialog` and `TagRenameDialog` (Sidebar.tsx ~lines 3564, 3604) — reused; the new menu's `+ New tag…` and per-tag `Rename…` items just call `openTagCreateDialog` / `openTagRenameDialog(tag)`.
- For tag deletion: `useEnvironmentStore.getState().sendCommand(envId, { type: "tag.delete", tagId })` — server command already wired.
- For per-project assignment: `useEnvironmentStore.getState().sendCommand(envId, { type: "project.meta.update", projectId, meta: { tags: [...] } })`.

## Implementation steps

1. **Extract `TagFilterMenu` component** in Sidebar.tsx. Props: `tags`, `selectedTagIds`, `onCreate`, `onToggleTag(tagId)`, `onClear`, `onRenameTag(tag)`, `onDeleteTag(tag)`. Internally renders `Menu` + `MenuTrigger` + `MenuPopup` with the structure shown above.
2. **Replace** the inline chip JSX (lines 2587–2637) with `<TagFilterMenu …>`. Keep the surrounding `SidebarGroup` wrapper so spacing in the sidebar is preserved.
3. **Wire delete** end-to-end: add `handleTagDelete(tag)` in Sidebar that fires `tag.delete` and clears the tag from the filter via `clearProjectTagFilterTagId`. (The shell-stream listener for `tag-removed` already handles the clear, so this is belt-and-braces.)
4. **Add `Edit tags…` entry** to the native project context menu. Its handler stores the click coords + project id in local state (`editTagsAnchor`) and renders a portaled `<ProjectTagAssignMenu>` anchored at those coords with `defaultOpen={true}` so it appears immediately.
5. **Build `ProjectTagAssignMenu`**. Props: `project`, `tags`, `anchor`, `onClose`, `onToggleAssignment(tagId, nextChecked)`. Each `MenuCheckboxItem` is checked iff `project.tags.includes(tag.id)`. Toggle fires `project.meta.update` with `meta: { tags: toggleProjectTagAssignment(project, tagId) }`.
6. **Tests** in `apps/web/src/components/Sidebar.logic.test.ts`:
   - `toggleProjectTagAssignment` adds an unselected tag, removes a selected tag, preserves order of remaining tags, dedupes.
   - Existing `filterProjectSnapshotsByTags` tests stay green.
7. **Visual / interaction tests** in `apps/web/src/components/Sidebar.browser.tsx` if such a file exists, otherwise rely on the existing browser test patterns:
   - Opening the filter trigger renders all tags as `MenuCheckboxItem`s with correct checked state.
   - Toggling a tag in the menu updates `projectTagFilter.selectedTagIds` and re-filters the project list.
   - Right-clicking a project shows `Edit tags…`; clicking it opens a menu where toggling fires a `project.meta.update`.

## Verification

- `bun fmt` and `bun lint` pass with 0 errors.
- `bun typecheck` passes for the `@t3tools/web` package.
- `bun test --filter=@t3tools/web` passes; new logic tests added to `Sidebar.logic.test.ts` pass.
- Manual smoke test on `localhost:3001` (per `honeycomb-navigation` skill):
  1. Open the sidebar; confirm the new `Tags ▾` trigger renders in place of the old chip wrap.
  2. Click the trigger → `New tag…` opens the create dialog; create one and confirm it appears as `MenuCheckboxItem` in the menu.
  3. Toggle two tags → project list filters as before; trigger label updates to `2 tags filtered`.
  4. Submenu on a tag row → `Rename…` opens the rename dialog; `Delete` removes the tag (and clears it from the active filter).
  5. Right-click a project → `Edit tags…` opens the per-project assignment menu; toggle a tag, close the menu, observe the project's tag set survives a refresh.
  6. Confirm the deferred `tag-removed` shell-stream handler still clears the filter when a tag is deleted from another window.

## Out of scope for this iteration

- Migrating the project context menu off Electron's native API to a fully React-based Menu (tracked separately).
- Switching to `Combobox` (Option B) — revisit if user-reported tag counts exceed ~30.
- Drag-to-reorder tags in the menu.
- Per-tag colour customisation.
