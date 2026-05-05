import { PlusIcon, TagsIcon } from "lucide-react";
import { useMemo } from "react";
import { type TagId } from "@t3tools/contracts";

import { cn } from "../lib/utils";
import type { Tag } from "../types";
import { Button } from "./ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Toggle } from "./ui/toggle";

interface ProjectTagsControlProps {
  assignedTagIds: readonly TagId[];
  availableTags: readonly Tag[];
  onToggleTag: (tagId: TagId, nextChecked: boolean) => void | Promise<void>;
  onCreateTag: () => void;
}

export default function ProjectTagsControl({
  assignedTagIds,
  availableTags,
  onToggleTag,
  onCreateTag,
}: ProjectTagsControlProps) {
  const assignedSet = useMemo(() => new Set<TagId>(assignedTagIds), [assignedTagIds]);
  const hasTags = availableTags.length > 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="xs" variant="outline" aria-label="Tags">
            <TagsIcon className="size-3.5" />
            <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
              Tags
            </span>
          </Button>
        }
      />
      <PopoverPopup align="end" className="w-72" data-testid="chat-header-project-tags-popup">
        <div className="flex flex-wrap items-center gap-1">
          {availableTags.map((tag) => {
            const pressed = assignedSet.has(tag.id);
            return (
              <Toggle
                key={tag.id}
                size="xs"
                variant="outline"
                pressed={pressed}
                onPressedChange={(nextPressed) => {
                  void onToggleTag(tag.id, nextPressed);
                }}
                aria-pressed={pressed}
                data-testid={`chat-header-project-tag-toggle-${tag.id}`}
                className={cn(
                  "h-6 rounded-full px-2 text-xs text-foreground/90 sm:h-5 sm:text-xs",
                  "data-pressed:border-foreground data-pressed:bg-foreground data-pressed:text-background",
                  "data-pressed:hover:bg-foreground/90",
                )}
              >
                <span className="max-w-40 truncate">{tag.name}</span>
              </Toggle>
            );
          })}
          <button
            type="button"
            aria-label="New tag"
            data-testid="chat-header-project-tag-create"
            onClick={onCreateTag}
            className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-input/60 text-muted-foreground/70 transition-colors hover:border-input hover:bg-accent hover:text-foreground sm:h-5 sm:min-w-5"
          >
            <PlusIcon className="size-3" />
          </button>
        </div>
        {!hasTags && <p className="mt-2 text-xs text-muted-foreground">No tags yet.</p>}
      </PopoverPopup>
    </Popover>
  );
}
