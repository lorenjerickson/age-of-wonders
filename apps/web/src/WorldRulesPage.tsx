import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Badge, Button, Input, Label } from "@aow/ui";
import {
  validateWorldRule,
  type WorldRule,
  type WorldRuleExecution,
  type WorldRuleEvent,
  type RuleStateView,
} from "@aow/common";
import {
  ApiRequestError,
  addStarterWorldMovementRules,
  duplicateWorldRule,
  getWorldDefinitionDraft,
  getWorldRules,
  previewWorldRules,
  saveWorldRule,
  type WorldRulesCollection,
} from "./api";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import { WorldRuleEditor } from "./WorldRuleEditor";
import { statusLabel } from "./campaignLibraryModel";

function draftRule(): WorldRule {
  return {
    formatVersion: 1,
    id: "new-rule",
    name: "New rule",
    revision: 1,
    lifecycle: "disabled",
    priority: 0,
    trigger: { event: "aow:movement-declared", version: 1 },
    effects: [
      { kind: "set-local", key: "cost", value: { kind: "constant", value: 0 } },
    ],
    audit: { createdBy: "draft-author", updatedAt: new Date().toISOString() },
  };
}
export function WorldRulesPage() {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const [collection, setCollection] = useState<WorldRulesCollection>();
  const [editor, setEditor] = useState<WorldRule>();
  const [existingId, setExistingId] = useState<string>();
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [budget, setBudget] = useState("30");
  const [distance, setDistance] = useState("10");
  const [slopes, setSlopes] = useState("2");
  const [result, setResult] = useState<WorldRuleExecution>();
  const requestSequence = useRef(0);
  const pending = useRef(false);
  const dirty = Boolean(editor && JSON.stringify(editor) !== baseline);
  const validation = editor ? validateWorldRule(editor) : undefined;
  useBlocker({
    shouldBlockFn: () =>
      pending.current ||
      (dirty && !window.confirm("Leave without saving this rule?")),
    enableBeforeUnload: dirty || Boolean(busy),
  });
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const data = await getWorldRules(definition.id);
      if (sequence === requestSequence.current) {
        setCollection(data);
        setError("");
        setStale(false);
      }
    } catch (caught) {
      if (sequence === requestSequence.current) {
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "Rules could not be loaded.",
        );
        if (
          caught instanceof ApiRequestError &&
          [401, 403, 404].includes(caught.status)
        )
          setCollection(undefined);
      }
    }
  }, [definition.id]);
  useEffect(() => {
    if (draft) void load();
    return () => {
      requestSequence.current++;
    };
  }, [draft?.id, load]);
  const revision = collection
    ? {
        expectedDraftId: collection.draftId,
        expectedStorageRevision: collection.storageRevision,
      }
    : undefined;
  function open(rule: WorldRule, id?: string) {
    setEditor(rule);
    setExistingId(id);
    setBaseline(JSON.stringify(rule));
    setError("");
    setNotice("");
  }
  async function mutate(
    action: string,
    operation: () => Promise<WorldRulesCollection>,
  ) {
    if (pending.current || stale) return;
    pending.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    requestSequence.current++;
    try {
      const data = await operation();
      setCollection(data);
      setEditor(undefined);
      setExistingId(undefined);
      setBaseline("");
      setResult(undefined);
      setNotice(
        "World draft rules saved. Publish and explicitly migrate downstream captures to use these changes in play.",
      );
      try {
        adoptDraft(await getWorldDefinitionDraft(definition.id));
      } catch {
        setNotice(
          "Rules saved. Reload the World draft before publishing to refresh its revision.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "Rules could not be saved. Your edits remain here.",
      );
      if (caught instanceof ApiRequestError && caught.status === 409)
        setStale(true);
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  async function test() {
    if (pending.current) return;
    const feet = Number(distance),
      slopeCount = Number(slopes);
    if (
      !Number.isFinite(feet) ||
      !Number.isInteger(slopeCount) ||
      feet < 0 ||
      slopeCount < 0
    ) {
      setError(
        "Use a non-negative distance and a whole number of sloped segments.",
      );
      return;
    }
    pending.current = true;
    setBusy("test");
    setError("");
    const event: WorldRuleEvent = {
      formatVersion: 1,
      id: "example-movement",
      rootEventId: "example-movement",
      idempotencyKey: "example-movement",
      type: "aow:movement-declared",
      version: 1,
      source: "gm",
      context: {
        actorId: "example-actor",
        destination: { x: 2, y: 0, z: 1 },
        distanceFeet: feet,
        slopedSegments: slopeCount,
        contactCount: 0,
        originInteriorCount: 0,
        destinationSupported: true,
      },
    };
    const state: RuleStateView = {
      runtime: {
        "example-actor": {
          type: "actor",
          fields: { position: { x: 0, y: 0, z: 1 } },
        },
      },
      captured: {},
      schema: {
        actor: {
          position: { type: "point", writable: true },
          "aow:movementRemaining": { type: "number", writable: true },
          "aow:moves": { type: "number", writable: true },
        },
      },
    };
    try {
      setResult(await previewWorldRules(definition.id, { event, state }));
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The rule test could not be completed.",
      );
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {definition.name || "World"}
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Rules</h1>
      <p className="mt-4 max-w-3xl opacity-65">
        Author event triggers, conditions and ordered effects for this World. No
        mechanics apply until enabled rules are published and captured by an
        Instance.
      </p>
      <DraftRequired>
        <>
          {stale && (
            <p className="mt-4 text-sm" role="status">
              This World draft changed. Refresh rules to review the latest
              version before saving.
            </p>
          )}
          {error && (
            <p className="mt-4 text-error" role="alert">
              {error}
            </p>
          )}
          <p className="mt-3 text-sm" role="status">
            {notice}
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <Button
              tone="primary"
              disabled={Boolean(busy) || dirty || !collection || !canEdit}
              onClick={() => open(draftRule())}
            >
              Create rule
            </Button>
            <Button
              tone="outline"
              disabled={Boolean(busy)}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "Discard unsaved rule edits and load the latest rules?",
                  )
                )
                  return;
                setEditor(undefined);
                setBaseline("");
                void load();
              }}
            >
              Refresh rules
            </Button>
            <Label>
              Starter movement budget (feet)
              <Input
                type="number"
                min="0"
                step="any"
                value={budget}
                className="mt-1 w-40"
                onChange={(event) => setBudget(event.currentTarget.value)}
              />
            </Label>
            <Button
              tone="outline"
              disabled={
                Boolean(busy) ||
                dirty ||
                !revision ||
                !canEdit ||
                !budget.trim() ||
                !Number.isFinite(Number(budget)) ||
                Number(budget) < 0
              }
              onClick={() =>
                revision &&
                void mutate("starter", () =>
                  addStarterWorldMovementRules(definition.id, {
                    ...revision,
                    budgetFeet: Number(budget),
                  }),
                )
              }
            >
              Add starter movement rules
            </Button>
          </div>
          <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
            <section aria-labelledby="world-rules-list">
              <h2 id="world-rules-list" className="text-xl font-semibold">
                World draft rules
              </h2>
              {collection?.rules.length ? (
                <ul className="mt-4 grid gap-3">
                  {collection.rules.map((rule) => (
                    <li
                      key={rule.id}
                      className="rounded-box border border-base-300 bg-base-200 p-4"
                    >
                      <p className="font-semibold">{rule.name}</p>
                      <p className="mt-1 text-xs opacity-65">
                        Revision {rule.revision} · priority {rule.priority}
                      </p>
                      <Badge className="mt-2" outline>
                        {statusLabel(rule.lifecycle)}
                      </Badge>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          tone="outline"
                          disabled={Boolean(busy) || dirty}
                          onClick={() => open(rule, rule.id)}
                        >
                          Edit {rule.name}
                        </Button>
                        <Button
                          size="sm"
                          tone="outline"
                          disabled={Boolean(busy) || dirty || !revision}
                          onClick={() =>
                            revision &&
                            void mutate("duplicate", () =>
                              duplicateWorldRule(
                                definition.id,
                                rule.id,
                                revision,
                              ),
                            )
                          }
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          tone="ghost"
                          disabled={Boolean(busy) || dirty || !revision}
                          onClick={() =>
                            revision &&
                            void mutate("lifecycle", () =>
                              saveWorldRule(
                                definition.id,
                                {
                                  ...revision,
                                  rule: {
                                    ...rule,
                                    lifecycle:
                                      rule.lifecycle === "enabled"
                                        ? "disabled"
                                        : "enabled",
                                  },
                                },
                                rule.id,
                              ),
                            )
                          }
                        >
                          {rule.lifecycle === "enabled" ? "Disable" : "Enable"}
                        </Button>
                        {rule.lifecycle !== "archived" && (
                          <Button
                            size="sm"
                            tone="ghost"
                            disabled={Boolean(busy) || dirty || !revision}
                            onClick={() =>
                              revision &&
                              void mutate("archive", () =>
                                saveWorldRule(
                                  definition.id,
                                  {
                                    ...revision,
                                    rule: { ...rule, lifecycle: "archived" },
                                  },
                                  rule.id,
                                ),
                              )
                            }
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm opacity-65">
                  {collection
                    ? "No rules yet. This World has no automatic mechanics."
                    : "Loading rules…"}
                </p>
              )}
            </section>
            <section
              className="min-w-0 rounded-box border border-base-300 bg-base-200 p-5"
              aria-label="Structured rule editor"
            >
              {editor ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (revision && validation?.valid)
                      void mutate("save", () =>
                        saveWorldRule(
                          definition.id,
                          { ...revision, rule: editor },
                          existingId,
                        ),
                      );
                  }}
                >
                  <fieldset disabled={Boolean(busy) || !canEdit}>
                    <WorldRuleEditor rule={editor} onChange={setEditor} />
                  </fieldset>
                  {validation && !validation.valid && (
                    <ul className="mt-4 text-sm text-error" role="alert">
                      {validation.issues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-5 flex gap-3">
                    <Button
                      type="submit"
                      tone="primary"
                      disabled={
                        Boolean(busy) ||
                        stale ||
                        !validation?.valid ||
                        !revision
                      }
                    >
                      {existingId ? "Save rule" : "Create rule"}
                    </Button>
                    <Button
                      tone="outline"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setEditor(undefined);
                        setBaseline("");
                      }}
                    >
                      Discard editor changes
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-sm opacity-65">
                  Choose a rule to edit its trigger, conditions and effect
                  order, or create a rule.
                </p>
              )}
            </section>
          </div>
          <section
            className="mt-8 rounded-box border border-base-300 bg-base-200 p-5"
            aria-labelledby="world-rule-test-heading"
          >
            <h2 id="world-rule-test-heading" className="text-xl font-semibold">
              Test saved movement rules
            </h2>
            <p className="mt-2 text-sm opacity-65">
              Simulate the saved draft against an example actor on a supported
              path with no obstacle contacts. Unsaved editor changes are
              excluded; no Instance is changed.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Label>
                Distance (feet)
                <Input
                  type="number"
                  min="0"
                  step="any"
                  className="mt-1 w-40"
                  value={distance}
                  onChange={(event) => setDistance(event.currentTarget.value)}
                />
              </Label>
              <Label>
                Sloped segments
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-40"
                  value={slopes}
                  onChange={(event) => setSlopes(event.currentTarget.value)}
                />
              </Label>
              <Button
                tone="outline"
                disabled={Boolean(busy) || !collection || dirty}
                onClick={() => void test()}
              >
                Test rules
              </Button>
            </div>
            {result && (
              <div className="mt-4">
                <Badge outline>{statusLabel(result.status)}</Badge>
                <ul className="mt-3 text-sm">
                  {result.diagnostics.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm">
                  {result.writes.length} effective changes in this simulation.
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                  {result.trace.map((entry, index) => (
                    <li key={index}>
                      {entry.ruleName ? entry.ruleName + ": " : ""}
                      {entry.detail}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </>
      </DraftRequired>
    </main>
  );
}
