import { worldWorkspaceSuffix } from "./worldAuthoringModel";
import { useRef, useState } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Button, Fieldset } from "@aow/ui";
import {
  validateWorldRule,
  type WorldRule,
  type WorldRulePredicate,
} from "@aow/common";
import {
  ApiRequestError,
  getWorldDefinitionDraft,
  saveWorldRule,
  type WorldRulesCollection,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { useInternalNavigate } from "./navigation";
import {
  ConditionEditor,
  EffectEditor,
  WorldRuleEditor,
  defaultRuleEffect,
} from "./WorldRuleEditor";
import {
  worldRuleVisibleText,
  replaceWorldRuleCondition,
  worldRuleConditionAt,
  worldRuleConditionChildren,
  type WorldRuleRoute,
} from "./worldRuleAuthoringModel";

function newRule(): WorldRule {
  return {
    formatVersion: 1,
    id: "new-rule",
    name: "New rule",
    revision: 1,
    lifecycle: "disabled",
    priority: 0,
    trigger: { event: "aow:movement-declared", version: 1 },
    effects: [defaultRuleEffect("set-local")],
    audit: { createdBy: "draft-author", updatedAt: new Date().toISOString() },
  };
}
function prepare(
  rule: WorldRule | undefined,
  route: WorldRuleRoute,
): WorldRule | undefined {
  if (!rule) return undefined;
  if (route.kind === "effect" && route.adding && Array.isArray(rule.effects))
    return {
      ...rule,
      effects: [...rule.effects, defaultRuleEffect("set-local")],
    };
  if (route.kind === "condition" && route.adding) {
    const parent = worldRuleConditionAt(rule, route.path);
    if (!route.path.length && !parent)
      return { ...rule, condition: { kind: "always" } };
    if (parent?.kind === "all" || parent?.kind === "any")
      return Array.isArray(parent.predicates)
        ? replaceWorldRuleCondition(rule, route.path, {
            ...parent,
            predicates: [...parent.predicates, { kind: "always" }],
          })
        : undefined;
    return undefined;
  }
  return rule;
}
export function WorldRuleContext({
  route,
  collection,
  reload,
  onSaved,
}: {
  route: WorldRuleRoute;
  collection: WorldRulesCollection;
  reload: () => Promise<void>;
  onSaved: (collection: WorldRulesCollection) => void;
}) {
  const { definition, canEdit, adoptDraft } = useWorldAuthoring();
  const navigateTo = useInternalNavigate();
  const workspaceSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const navigate = (href: string) => navigateTo(href + workspaceSuffix);
  const [pinned] = useState(collection);
  const [source] = useState(() => {
    if (route.kind === "new") return newRule();
    const matches = collection.rules.filter(
      (rule) => rule?.id === route.ruleId,
    );
    return matches.length === 1 && validateWorldRule(matches[0]).valid
      ? matches[0]
      : undefined;
  });
  const [rule, setRule] = useState(() => prepare(source, route));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(prepare(source, route)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const pending = useRef(false),
    leaving = useRef(false);
  const dirty = JSON.stringify(rule) !== baseline;
  useBlocker({
    shouldBlockFn: () =>
      !leaving.current &&
      (pending.current ||
        (dirty && !window.confirm("Leave without saving this rule?"))),
    enableBeforeUnload: dirty || busy,
  });
  const base = `/worlds/${encodeURIComponent(definition.id)}/rules`;
  const owner = `${base}/${encodeURIComponent(route.ruleId ?? "")}`;
  const conditionUrl = (path: readonly number[]) =>
    `${owner}/conditions${path.map((index) => `/children/${index + 1}`).join("")}`;
  const isList = route.kind === "effects" || route.kind === "conditions";
  const conditionParent = source && worldRuleConditionAt(source, route.path);
  const conditionPath =
    route.adding &&
    conditionParent &&
    (conditionParent.kind === "all" || conditionParent.kind === "any") &&
    Array.isArray(conditionParent.predicates)
      ? [...route.path, conditionParent.predicates.length]
      : route.path;
  const effectIndex = route.adding
    ? (source?.effects?.length ?? 0)
    : route.index;
  const value = rule && worldRuleConditionAt(rule, conditionPath);
  const condition = rule && worldRuleConditionAt(rule, route.path);
  const children = worldRuleConditionChildren(condition);
  const back =
    route.kind === "new" || route.kind === "edit"
      ? base
      : route.kind === "effect"
        ? `${owner}/effects`
        : route.kind === "condition"
          ? conditionUrl(route.adding ? route.path : route.path.slice(0, -1))
          : route.kind === "conditions" && route.path.length
            ? conditionUrl(route.path.slice(0, -1))
            : `${owner}/edit`;
  const title =
    route.kind === "new"
      ? "Add rule"
      : route.kind === "edit"
        ? "Edit rule"
        : route.kind === "effects"
          ? "Ordered effects"
          : route.kind === "effect"
            ? route.adding
              ? "Add effect"
              : `Edit effect ${(route.index ?? 0) + 1}`
            : route.kind === "condition"
              ? route.adding
                ? "Add condition"
                : "Edit condition"
              : "Conditions";
  const validOwner =
    source &&
    validateWorldRule(source).valid &&
    rule &&
    Array.isArray(rule.effects) &&
    rule.trigger &&
    typeof rule.trigger === "object" &&
    (route.kind !== "effect" ||
      (effectIndex !== undefined && Boolean(rule.effects[effectIndex]))) &&
    (route.kind !== "condition" || Boolean(value)) &&
    (route.kind !== "conditions" || !route.path.length || Boolean(condition));
  const validation = rule ? validateWorldRule(rule) : undefined;
  async function save(next: WorldRule, destination: string) {
    if (
      pending.current ||
      !canEdit ||
      stale ||
      !validOwner ||
      !validateWorldRule(next).valid
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await saveWorldRule(
        definition.id,
        {
          expectedDraftId: pinned.draftId,
          expectedStorageRevision: pinned.storageRevision,
          rule: next,
        },
        route.kind === "new" ? undefined : route.ruleId,
      );
      setBaseline(JSON.stringify(next));
      try {
        adoptDraft(await getWorldDefinitionDraft(definition.id));
      } catch {
        /* The confirmed save response below remains authoritative for rules. */
      }
      leaving.current = true;
      onSaved(saved);
      await navigate(destination);
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
      setBusy(false);
    }
  }
  function changeCondition(next: WorldRulePredicate) {
    if (rule) {
      const updated = replaceWorldRuleCondition(rule, conditionPath, next);
      if (updated) setRule(updated);
    }
  }
  const go = (destination: string) => void navigate(destination);
  const cancel = () => {
    if (busy) return;
    leaving.current = true;
    go(back);
  };
  if (!validOwner || route.kind === "invalid")
    return (
      <main className="p-6">
        <h1 className="text-2xl">Rule unavailable</h1>
        <p>
          This rule or child could not be identified safely. Return to the rule
          list.
        </p>
        <Button className="mt-4" onClick={() => go(base)}>
          Back to rules
        </Button>
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl min-w-0 px-6 py-8 [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">
      <p className="text-sm opacity-65">
        {worldRuleVisibleText(definition.name, "World", [definition.id])} ·{" "}
        {worldRuleVisibleText(
          rule.name,
          "Unnamed rule",
          pinned.rules
            .map((entry) => entry?.id)
            .filter((id): id is string => typeof id === "string"),
        )}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <Button
        className="mt-4"
        tone="outline"
        disabled={busy}
        onClick={() => go(back)}
      >
        {route.kind === "edit" || route.kind === "new"
          ? "Back to rules"
          : route.kind === "effect"
            ? "Back to effects"
            : route.kind === "condition" || route.path.length
              ? "Back to conditions"
              : "Back to rule"}
      </Button>
      {!canEdit && (
        <p className="mt-4" role="status">
          This World is read only.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-error">
          {error}
        </p>
      )}
      {stale && (
        <div className="mt-4">
          <p>
            Your edits remain here. Refresh to discard them and review the
            latest rule.
          </p>
          <Button
            onClick={async () => {
              if (!window.confirm("Discard unsaved changes and refresh rules?"))
                return;
              leaving.current = true;
              await reload();
              go(base);
            }}
          >
            Refresh rules
          </Button>
        </div>
      )}
      {route.kind === "new" && (
        <p className="mt-4 text-sm">
          New rules start disabled with a local cost effect. Create the rule to
          manage its effects and conditions.
        </p>
      )}
      {route.kind === "edit" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button tone="outline" onClick={() => go(`${owner}/effects`)}>
            Manage effects
          </Button>
          <Button tone="outline" onClick={() => go(`${owner}/conditions`)}>
            Manage conditions
          </Button>
        </div>
      )}
      {isList ? (
        <Fieldset
          disabled={busy || !canEdit || stale}
          className="mt-5 grid gap-4"
        >
          {route.kind === "effects" ? (
            <>
              <Button
                tone="primary"
                disabled={rule.effects.length >= 32}
                onClick={() => go(`${owner}/effects/new`)}
              >
                Add effect
              </Button>
              {!rule.effects.length && <p>No effects yet.</p>}
              <ol className="grid gap-3">
                {rule.effects.map((effect, index) => (
                  <li
                    key={index}
                    className="rounded-box border border-base-300 p-4"
                  >
                    <h2 className="font-semibold">Effect {index + 1}</h2>
                    <p>
                      {[
                        "set",
                        "increment",
                        "move",
                        "set-local",
                        "emit",
                        "roll",
                      ].includes(effect?.kind)
                        ? effect.kind.replaceAll("-", " ")
                        : "Imported effect"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        tone="outline"
                        onClick={() => go(`${owner}/effects/${index + 1}/edit`)}
                      >
                        Edit effect {index + 1}
                      </Button>
                      <Button
                        disabled={index === 0}
                        onClick={() => {
                          const effects = [...rule.effects];
                          [effects[index - 1], effects[index]] = [
                            effects[index]!,
                            effects[index - 1]!,
                          ];
                          void save({ ...rule, effects }, `${owner}/effects`);
                        }}
                      >
                        Move up
                      </Button>
                      <Button
                        disabled={index === rule.effects.length - 1}
                        onClick={() => {
                          const effects = [...rule.effects];
                          [effects[index + 1], effects[index]] = [
                            effects[index]!,
                            effects[index + 1]!,
                          ];
                          void save({ ...rule, effects }, `${owner}/effects`);
                        }}
                      >
                        Move down
                      </Button>
                      <Button
                        tone="danger"
                        disabled={rule.effects.length <= 1}
                        onClick={() => {
                          if (window.confirm("Remove this effect?"))
                            void save(
                              {
                                ...rule,
                                effects: rule.effects.filter(
                                  (_, i) => i !== index,
                                ),
                              },
                              `${owner}/effects`,
                            );
                        }}
                      >
                        Remove effect
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              {!condition ? (
                <>
                  <p>No condition. This rule always applies when triggered.</p>
                  <Button onClick={() => go(`${conditionUrl(route.path)}/new`)}>
                    Add condition
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => go(`${conditionUrl(route.path)}/edit`)}
                    >
                      Edit condition
                    </Button>
                    {!route.path.length && (
                      <Button
                        tone="danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this condition and its children?",
                            )
                          ) {
                            const next = replaceWorldRuleCondition(
                              rule,
                              [],
                              undefined,
                            );
                            if (next) void save(next, conditionUrl([]));
                          }
                        }}
                      >
                        Remove condition
                      </Button>
                    )}
                  </div>
                  <p>
                    {(
                      {
                        always: "Always",
                        never: "Never",
                        all: "All conditions",
                        any: "Any condition",
                        not: "Not",
                        compare: "Compare values",
                      } as Record<string, string>
                    )[condition.kind] || "Imported condition"}
                  </p>
                  {children && (
                    <>
                      <ol className="grid gap-3">
                        {children.map((_, index) => (
                          <li
                            key={index}
                            className="rounded-box border border-base-300 p-4"
                          >
                            <h2>Condition {index + 1}</h2>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                onClick={() =>
                                  go(
                                    `${conditionUrl([...route.path, index])}/edit`,
                                  )
                                }
                              >
                                Edit condition {index + 1}
                              </Button>
                              <Button
                                onClick={() =>
                                  go(conditionUrl([...route.path, index]))
                                }
                              >
                                Manage child conditions
                              </Button>
                              {condition.kind !== "not" && (
                                <>
                                  <Button
                                    disabled={index === 0}
                                    onClick={() => {
                                      const predicates = [...children];
                                      [
                                        predicates[index - 1],
                                        predicates[index],
                                      ] = [
                                        predicates[index]!,
                                        predicates[index - 1]!,
                                      ];
                                      const next = replaceWorldRuleCondition(
                                        rule,
                                        route.path,
                                        {
                                          ...condition,
                                          predicates,
                                        } as WorldRulePredicate,
                                      );
                                      if (next)
                                        void save(
                                          next,
                                          conditionUrl(route.path),
                                        );
                                    }}
                                  >
                                    Move up
                                  </Button>
                                  <Button
                                    disabled={index === children.length - 1}
                                    onClick={() => {
                                      const predicates = [...children];
                                      [
                                        predicates[index + 1],
                                        predicates[index],
                                      ] = [
                                        predicates[index]!,
                                        predicates[index + 1]!,
                                      ];
                                      const next = replaceWorldRuleCondition(
                                        rule,
                                        route.path,
                                        {
                                          ...condition,
                                          predicates,
                                        } as WorldRulePredicate,
                                      );
                                      if (next)
                                        void save(
                                          next,
                                          conditionUrl(route.path),
                                        );
                                    }}
                                  >
                                    Move down
                                  </Button>
                                  <Button
                                    tone="danger"
                                    disabled={children.length <= 1}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Remove this child condition?",
                                        )
                                      ) {
                                        const next = replaceWorldRuleCondition(
                                          rule,
                                          [...route.path, index],
                                          undefined,
                                        );
                                        if (next)
                                          void save(
                                            next,
                                            conditionUrl(route.path),
                                          );
                                      }
                                    }}
                                  >
                                    Remove condition
                                  </Button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                      {condition.kind !== "not" && (
                        <Button
                          disabled={children.length >= 32}
                          onClick={() => go(`${conditionUrl(route.path)}/new`)}
                        >
                          Add condition
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Fieldset>
      ) : (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save(rule, back);
          }}
        >
          <Fieldset disabled={busy || !canEdit || stale}>
            {route.kind === "edit" || route.kind === "new" ? (
              <WorldRuleEditor rule={rule} onChange={setRule} />
            ) : route.kind === "effect" ? (
              <EffectEditor
                value={rule.effects[effectIndex!]!}
                onChange={(effect) =>
                  setRule({
                    ...rule,
                    effects: rule.effects.map((entry, index) =>
                      index === effectIndex ? effect : entry,
                    ),
                  })
                }
              />
            ) : (
              <ConditionEditor value={value!} onChange={changeCondition} />
            )}
          </Fieldset>
          {validation && !validation.valid && (
            <p className="mt-4 text-error" role="alert">
              Complete the rule's required fields with valid values before
              saving.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="submit"
              tone="primary"
              disabled={busy || !canEdit || stale || !validation?.valid}
            >
              {busy
                ? "Saving…"
                : route.kind === "new"
                  ? "Create rule"
                  : route.kind === "effect"
                    ? "Save effect"
                    : route.kind === "condition"
                      ? "Save condition"
                      : "Save rule"}
            </Button>
            <Button tone="outline" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
