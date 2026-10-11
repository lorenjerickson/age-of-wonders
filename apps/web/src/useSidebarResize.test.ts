import { describe, expect, it } from "vitest";
import { clampSidebarWidth, sidebarMaximumWidth } from "./useSidebarResize";

describe("secondary navigation width", () => {
  it("bounds saved or dragged widths and recovers from invalid storage", () => {
    expect(clampSidebarWidth(150)).toBe(200);
    expect(clampSidebarWidth(900)).toBe(400);
    expect(clampSidebarWidth(Number.NaN)).toBe(224);
    expect(clampSidebarWidth(Infinity)).toBe(224);
  });

  it("reserves content space when tools are visible on a narrow desktop", () => {
    const maximum = sidebarMaximumWidth(1024, true);
    expect(maximum).toBe(244);
    expect(clampSidebarWidth(400, maximum)).toBe(244);
    expect(sidebarMaximumWidth(1024, false)).toBe(400);
    expect(sidebarMaximumWidth(1440, true)).toBe(400);
  });
});
