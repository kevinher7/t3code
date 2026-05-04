import { useMemo, useState } from "react";
import { ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";
import { type TagId } from "@t3tools/contracts";
import type { Tag } from "../types";
import { cn } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Menu, MenuItem, MenuPopup } from "./ui/menu";
import { Toggle } from "./ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { SidebarSectionHeader } from "./SidebarSectionHeader";

interface TagFilterPillContextMenuProps {
  anchor: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function TagFilterPillContextMenu({
  anchor,
  onClose,
  onRename,
  onDelete,
}: TagFilterPillContextMenuProps) {
  // The portaled positioner reads anchor coordinates from a virtual element
  // whose `getBoundingClientRect` returns a zero-size rect at the click point.
  // Mirrors the approach used by ProjectTagsEditor.
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
        className="min-w-32"
      >
        <MenuItem
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          Rename…
        </MenuItem>
        <MenuItem
          variant="destructive"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

interface TagFilterPillProps {
  tag: Tag;
  pressed: boolean;
  onPressedChange: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function TagFilterPill({
  tag,
  pressed,
  onPressedChange,
  onRename,
  onDelete,
}: TagFilterPillProps) {
  const [contextAnchor, setContextAnchor] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <Toggle
        size="xs"
        variant="outline"
        pressed={pressed}
        onPressedChange={onPressedChange}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextAnchor({ x: event.clientX, y: event.clientY });
        }}
        data-testid={`sidebar-tag-filter-item-${tag.id}`}
        aria-pressed={pressed}
        className={cn(
          "h-6 rounded-full px-2 text-xs text-foreground/90 sm:h-5 sm:text-xs",
          "data-pressed:border-foreground data-pressed:bg-foreground data-pressed:text-background",
          "data-pressed:hover:bg-foreground/90",
        )}
      >
        <span
          data-testid={`sidebar-tag-filter-toggle-${tag.id}`}
          className="max-w-40 truncate"
        >
          {tag.name}
        </span>
      </Toggle>
      {contextAnchor ? (
        <TagFilterPillContextMenu
          anchor={contextAnchor}
          onClose={() => setContextAnchor(null)}
          onRename={onRename}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

export interface SidebarTagFilterProps {
  tags: readonly Tag[];
  selectedTagIds: readonly TagId[];
  onCreate: () => void;
  onToggleTag: (tagId: TagId) => void;
  onClear: () => void;
  onRenameTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
}

export function SidebarTagFilter({
  tags,
  selectedTagIds,
  onCreate,
  onToggleTag,
  onClear,
  onRenameTag,
  onDeleteTag,
}: SidebarTagFilterProps) {
  const [open, setOpen] = useState(true);
  const hasSelection = selectedTagIds.length > 0;
  const headerLabel = hasSelection && !open ? `Tags (${selectedTagIds.length})` : "Tags";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarSectionHeader label={headerLabel}>
        {hasSelection ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Clear tag filter"
                  data-testid="sidebar-tag-filter-clear"
                  className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  onClick={onClear}
                />
              }
            >
              <XIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="right">Clear filter</TooltipPopup>
          </Tooltip>
        ) : null}
        <CollapsibleTrigger
          data-testid="sidebar-tag-filter-trigger"
          aria-label={open ? "Collapse tags" : "Expand tags"}
          className="group inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRightIcon className="size-3.5 transition-transform duration-150 group-data-panel-open:rotate-90" />
        </CollapsibleTrigger>
      </SidebarSectionHeader>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-1 px-2 pb-0.5">
          {tags.map((tag) => (
            <TagFilterPill
              key={tag.id}
              tag={tag}
              pressed={selectedTagIds.includes(tag.id)}
              onPressedChange={() => onToggleTag(tag.id)}
              onRename={() => onRenameTag(tag)}
              onDelete={() => onDeleteTag(tag)}
            />
          ))}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="New tag"
                  data-testid="sidebar-tag-filter-create"
                  onClick={onCreate}
                  className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-input/60 text-muted-foreground/70 transition-colors hover:border-input hover:bg-accent hover:text-foreground sm:h-5 sm:min-w-5"
                />
              }
            >
              <PlusIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="right">New tag</TooltipPopup>
          </Tooltip>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
