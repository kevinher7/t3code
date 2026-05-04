import * as React from "react";

export interface SidebarSectionHeaderProps {
  label: string;
  children?: React.ReactNode;
}

/**
 * Shared header used for top-level sidebar sections (Tags, Projects, …).
 * Keeps label typography, padding, and right-aligned action slot consistent
 * across sections so they have the exact same formatting and size.
 */
export function SidebarSectionHeader({ label, children }: SidebarSectionHeaderProps) {
  return (
    <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      {children ? <div className="flex items-center gap-1">{children}</div> : null}
    </div>
  );
}
