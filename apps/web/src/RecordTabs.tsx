import type { KeyboardEvent } from "react";
import { Tab, Tabs } from "@aow/ui";
import { InternalLink } from "./navigation";

export interface RecordTab {
  id: string;
  label: string;
  href?: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function recordTabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

function revealTab(tab: HTMLElement | null) {
  const row = tab?.closest<HTMLElement>('[role="tablist"]');
  if (!tab || !row) return;
  const bounds = tab.getBoundingClientRect();
  const viewport = row.getBoundingClientRect();
  if (bounds.left < viewport.left)
    row.scrollLeft -= viewport.left - bounds.left;
  else if (bounds.right > viewport.right)
    row.scrollLeft += bounds.right - viewport.right;
}

/** Property groups belong to the record, separate from workspace navigation.
 * Arrow keys move focus; Enter or Space activates the focused group. This keeps
 * route-backed tabs from triggering unsaved-change prompts during exploration. */
export function RecordTabs({
  label,
  tabs,
  activeTab,
  onTabChange,
  idPrefix,
  panelId,
}: {
  label: string;
  tabs: readonly RecordTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;
  idPrefix: string;
  panelId?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      const target = event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLElement>('[role="tab"]')[next];
      target?.focus({ preventScroll: true });
      if (target) revealTab(target);
    } else if (event.key === " " && tabs[index].href) {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <Tabs
      aria-label={label}
      aria-orientation="horizontal"
      className="mt-5 flex min-w-0 w-full flex-nowrap overflow-x-auto border-b border-base-300"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeTab;
        const props = {
          id: recordTabId(idPrefix, tab.id),
          ref: active ? revealTab : undefined,
          "aria-controls": panelId ?? `${idPrefix}-panel-${tab.id}`,
          tabIndex: active ? 0 : -1,
          onKeyDown: (event: KeyboardEvent<HTMLElement>) =>
            onKeyDown(event, index),
          className:
            "min-h-11 min-w-11 shrink-0 whitespace-nowrap px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
        };
        return tab.href ? (
          <InternalLink
            {...props}
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={`tab ${active ? "tab-active" : ""} ${props.className}`}
          >
            {tab.label}
          </InternalLink>
        ) : (
          <Tab
            {...props}
            key={tab.id}
            active={active}
            onClick={() => onTabChange?.(tab.id)}
          >
            {tab.label}
          </Tab>
        );
      })}
    </Tabs>
  );
}
