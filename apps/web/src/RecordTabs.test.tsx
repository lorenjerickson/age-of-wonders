import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { RecordTabs, recordTabId } from "./RecordTabs";

vi.mock("./navigation", () => ({
  InternalLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "equipment", label: "Equipment" },
  { id: "artwork", label: "Artwork" },
];

function renderTabs(onTabChange = vi.fn()) {
  return RecordTabs({
    label: "Item properties",
    tabs,
    activeTab: "overview",
    onTabChange,
    idPrefix: "item",
    panelId: "item-editor",
  });
}

describe("record property tabs", () => {
  it("exposes the selected group, shared panel, and one keyboard entry point", () => {
    const html = renderToStaticMarkup(renderTabs());
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Item properties"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/aria-controls="item-editor"/g)).toHaveLength(3);
    expect(html).toContain(`id="${recordTabId("item", "overview")}"`);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-h-11");
  });

  it("moves focus with arrows, Home, and End without changing the active group", () => {
    const select = vi.fn();
    const root = renderTabs(select);
    const children = root.props.children as ReactElement<{
      onKeyDown(event: KeyboardEvent<HTMLElement>): void;
      onClick(): void;
    }>[];
    const targets = tabs.map(() => ({ focus: vi.fn(), closest: () => null }));
    const preventDefault = vi.fn();
    for (const [key, expected] of [
      ["ArrowRight", 1],
      ["ArrowLeft", 2],
      ["End", 2],
      ["Home", 0],
    ] as const) {
      children[0].props.onKeyDown({
        key,
        preventDefault,
        currentTarget: {
          closest: () => ({ querySelectorAll: () => targets }),
        },
      } as unknown as KeyboardEvent<HTMLElement>);
      expect(targets[expected].focus).toHaveBeenCalled();
    }
    expect(preventDefault).toHaveBeenCalledTimes(4);
    expect(select).not.toHaveBeenCalled();
    children[1].props.onClick();
    expect(select).toHaveBeenCalledWith("equipment");
  });

  it("retains route hrefs and supports Space activation for a route tab", () => {
    const root = RecordTabs({
      label: "Location properties",
      tabs: [{ id: "map", label: "Map", href: "/worlds/example/location/map" }],
      activeTab: "map",
      idPrefix: "location",
    });
    const html = renderToStaticMarkup(root);
    expect(html).toContain('href="/worlds/example/location/map"');
    expect(html).toContain('aria-controls="location-panel-map"');
    const click = vi.fn();
    const preventDefault = vi.fn();
    root.props.children[0].props.onKeyDown({
      key: " ",
      preventDefault,
      currentTarget: { click },
    } as unknown as KeyboardEvent<HTMLElement>);
    expect(click).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
