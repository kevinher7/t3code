import { useMemo } from "react";
import { PlusIcon } from "lucide-react";
import { type TagId } from "@t3tools/contracts";
import type { Tag } from "../../types";
import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
} from "../ui/menu";

export interface ProjectTagsEditorProps {
  projectMember: SidebarProjectGroupMember;
  tags: readonly Tag[];
  anchor: { x: number; y: number };
  onClose: () => void;
  onToggleAssignment: (tagId: TagId, nextChecked: boolean) => void;
  onCreateTag: () => void;
}

export function ProjectTagsEditor({
  projectMember,
  tags,
  anchor,
  onClose,
  onToggleAssignment,
  onCreateTag,
}: ProjectTagsEditorProps) {
  const assignedTagIds = useMemo(() => new Set<TagId>(projectMember.tags), [projectMember.tags]);
  // The portaled positioner reads --anchor-{x,y} via the `anchor` prop. We use a
  // `getBoundingClientRect` virtual element that returns a zero-size rect at the
  // click coordinates, which makes Base UI place the popup at that point.
  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: (): DOMRect => ({
        x: anchor.x,
        y: anchor.y,
        top: anchor.y,
        left: anchor.x,
        right: anchor.x,
        bottom: anchor.y,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    }),
    [anchor.x, anchor.y],
  );

  return (
    <Menu
      defaultOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <MenuPopup
        anchor={virtualAnchor}
        align="start"
        side="bottom"
        className="min-w-56"
        data-testid="sidebar-project-tag-assign-popup"
      >
        <MenuItem
          data-testid="sidebar-project-tag-assign-create"
          onClick={(event) => {
            event.preventDefault();
            onCreateTag();
          }}
        >
          <PlusIcon className="size-3.5" />
          <span>New tag…</span>
        </MenuItem>
        {tags.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              {tags.map((tag) => {
                const isAssigned = assignedTagIds.has(tag.id);
                return (
                  <MenuCheckboxItem
                    key={tag.id}
                    data-testid={`sidebar-project-tag-assign-item-${tag.id}`}
                    checked={isAssigned}
                    closeOnClick={false}
                    onCheckedChange={(nextChecked) => {
                      onToggleAssignment(tag.id, nextChecked);
                    }}
                  >
                    <span className="truncate">{tag.name}</span>
                  </MenuCheckboxItem>
                );
              })}
            </MenuGroup>
          </>
        ) : (
          <>
            <MenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No tags yet — create one above.
            </div>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
