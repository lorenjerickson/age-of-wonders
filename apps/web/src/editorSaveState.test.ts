import { describe, expect, it, vi } from "vitest";
import { createEditorSaveState } from "./editorSaveState";

describe("editor save and navigation timing", () => {
  it("lets post-save navigation proceed before a React rerender", async () => {
    const state = createEditorSaveState("blank");
    const submitted = "profession";
    // The router still has the callback registered by the dirty render.
    const confirm = vi.fn(() => false);
    const shouldBlock = () => state.hasChanges(submitted) && !confirm();
    await state.run(async () => {
      await Promise.resolve();
      state.markSaved(submitted);
      expect(shouldBlock()).toBe(false);
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(state.hasChanges("edited profession")).toBe(true);
  });

  it("blocks a second submission throughout the request and navigation", async () => {
    const state = createEditorSaveState("blank");
    let finishRequest!: () => void;
    let finishNavigation!: () => void;
    const request = new Promise<void>((resolve) => { finishRequest = resolve; });
    const navigation = new Promise<void>((resolve) => { finishNavigation = resolve; });
    const create = vi.fn(async () => {
      await request;
      state.markSaved("profession");
      await navigation;
    });
    const first = state.run(create);
    await state.run(create);
    finishRequest();
    await Promise.resolve();
    await state.run(create);
    expect(create).toHaveBeenCalledTimes(1);
    finishNavigation();
    await first;
    const update = vi.fn(async () => {});
    await state.run(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retains the leave warning after failure and permits retry", async () => {
    const state = createEditorSaveState("blank");
    await expect(state.run(async () => { throw new Error("Save failed"); }))
      .rejects.toThrow("Save failed");
    expect(state.hasChanges("profession")).toBe(true);
    await state.run(async () => { state.markSaved("profession"); });
    expect(state.hasChanges("profession")).toBe(false);
  });

  it("does not mark changes made during the request as saved", async () => {
    const state = createEditorSaveState("blank");
    await state.run(async () => { state.markSaved("submitted profession"); });
    expect(state.hasChanges("newer profession changes")).toBe(true);
  });
});
