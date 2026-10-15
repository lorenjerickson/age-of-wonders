import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CombatActivity,
  CombatActivityRule,
  CombatContribution,
  CombatOutcome,
  CombatPlan,
  CombatProfile,
  CombatantState,
  EntityId,
  EncounterCommand,
  EncounterState,
  PlayerEncounterProjection,
} from "@aow/common";
import {
  Button,
  Details,
  Fieldset,
  Input,
  Label,
  Select,
  Summary,
  Textarea,
} from "@aow/ui";
import {
  ApiRequestError,
  commandSessionCombat,
  getSessionCombat,
  type SessionCombatContext,
  type SessionCombatRequest,
  type SessionCombatSetupActor,
} from "./api";
import {
  combatFormulaNames,
  emptyCombatProfile,
  formatCombatTerms,
  parseCombatTerms,
  reorderCombatActivities,
} from "./sessionCombatModel";

type CommandInput = EncounterCommand extends infer C
  ? C extends EncounterCommand
    ? Omit<C, "expectedRevision" | "commandId">
    : never
  : never;
type Props = {
  campaignDefinitionId?: string;
  campaignInstanceId: string;
  sessionId: string;
  blocked?: boolean;
  onCommitted?: () => void;
};
const control = "min-h-11 w-full";
const titleCase = (value: string) =>
  value.replace(
    /(^|-)(\w)/g,
    (_, separator, letter: string) =>
      `${separator ? " " : ""}${letter.toUpperCase()}`,
  );

export function SessionCombatPanel(props: Props) {
  const {
    campaignDefinitionId,
    campaignInstanceId,
    sessionId,
    blocked,
    onCommitted,
  } = props;
  const [context, setContext] = useState<SessionCombatContext>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await getSessionCombat(
        campaignInstanceId,
        sessionId,
        campaignDefinitionId,
      );
      if (current === sequence.current) {
        setContext(result);
        setError("");
      }
    } catch (caught) {
      if (
        current === sequence.current &&
        caught instanceof ApiRequestError &&
        [401, 403, 404].includes(caught.status)
      )
        setContext(undefined);
      if (current === sequence.current)
        setError(
          "Combat could not be refreshed. Your local plan is retained; retry before submitting.",
        );
    }
  }, [campaignDefinitionId, campaignInstanceId, sessionId]);
  useEffect(() => {
    setContext(undefined);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  async function send(
    input: Omit<
      SessionCombatRequest,
      "expectedRuntimeRevision" | "idempotencyKey"
    >,
  ) {
    if (!context || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await commandSessionCombat(
        campaignInstanceId,
        sessionId,
        campaignDefinitionId,
        {
          ...input,
          expectedRuntimeRevision: context.runtimeRevision,
          idempotencyKey: input.command?.commandId ?? crypto.randomUUID(),
        },
      );
      setContext(result);
      setNotice("Combat saved.");
      onCommitted?.();
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "Combat changed in another window. Refresh, review the latest state, then save your retained local plan again."
          : "Combat could not be saved. Review the inputs and retry; your local changes are retained.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function command(input: CommandInput) {
    if (!context?.encounter) return false;
    return send({
      command: {
        ...input,
        commandId: crypto.randomUUID(),
        expectedRevision: context.encounter.revision,
      } as EncounterCommand,
    });
  }
  const encounter = context?.encounter;
  const gm = encounter && "simulated" in encounter ? encounter : undefined;
  const disabled = busy || Boolean(blocked);
  return (
    <section
      aria-label="Combat plans"
      className="grid min-w-0 gap-4 py-4 [&_button]:min-h-11 [&_summary]:min-h-11"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">Combat plans</h3>
        <Button tone="outline" disabled={busy} onClick={() => void load()}>
          Refresh combat
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {blocked && <p>Resume the Session to change combat.</p>}
      {!context && !error && <p role="status">Loading combat…</p>}
      {context &&
        !encounter &&
        (campaignDefinitionId ? (
          <CombatSetup
            context={context}
            disabled={disabled}
            save={(setup) => send({ setup })}
          />
        ) : (
          <p>No encounter is active.</p>
        ))}
      {gm?.phase === "completed" && (
        <Button
          disabled={disabled}
          onClick={() => setContext({ ...context!, encounter: null })}
        >
          Set up another encounter
        </Button>
      )}
      {encounter && (
        <>
          <p className="font-medium">
            {encounter.name} · Round {encounter.round} ·{" "}
            {titleCase(encounter.phase)}
            {encounter.paused ? " · Paused" : ""}
          </p>
          <p className="text-sm">
            Plans unfold together. Each movement step is 5 feet; logical slots
            do not give other activities a duration.
          </p>
          {gm?.conflict && (
            <ConflictPanel
              key={gm.conflict.id}
              encounter={gm}
              disabled={disabled || gm.paused}
              command={command}
            />
          )}
          {gm && (
            <div className="flex flex-wrap gap-2">
              {gm.paused ? (
                <Button
                  disabled={disabled}
                  onClick={() => void command({ kind: "resume" })}
                >
                  Resume combat
                </Button>
              ) : (
                <>
                  {gm.phase === "planning" && (
                    <Button
                      disabled={disabled}
                      onClick={() => void command({ kind: "lock" })}
                    >
                      End planning & lock submitted plans
                    </Button>
                  )}
                  {["locked", "resolving"].includes(gm.phase) && (
                    <Button
                      disabled={disabled}
                      onClick={() => void command({ kind: "step" })}
                    >
                      Resolve next slot
                    </Button>
                  )}
                  {gm.phase === "review" && (
                    <Button
                      disabled={disabled}
                      onClick={() => void command({ kind: "publish" })}
                    >
                      Publish round outcome
                    </Button>
                  )}
                  {gm.phase === "published" && (
                    <Button
                      disabled={disabled}
                      onClick={() => void command({ kind: "next-round" })}
                    >
                      Start next round
                    </Button>
                  )}
                  {!["completed", "published", "planning"].includes(
                    gm.phase,
                  ) && (
                    <Button
                      tone="outline"
                      disabled={disabled}
                      onClick={() => void command({ kind: "reopen" })}
                    >
                      Reject proposal & reopen planning
                    </Button>
                  )}
                  {gm.phase !== "completed" && (
                    <Button
                      tone="outline"
                      disabled={disabled}
                      onClick={() => void command({ kind: "pause" })}
                    >
                      Pause combat
                    </Button>
                  )}
                  {["planning", "published"].includes(gm.phase) && (
                    <Button
                      tone="outline"
                      disabled={disabled}
                      onClick={() => void command({ kind: "complete" })}
                    >
                      Complete encounter
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {gm?.phase === "planning" && (
            <p className="text-sm">
              Unsubmitted plans remain idle when planning ends.
            </p>
          )}
          {gm &&
            ["locked", "resolving", "adjudication", "review"].includes(
              gm.phase,
            ) && (
              <section
                aria-label="Simulated round preview"
                className="rounded-box border border-base-300 p-3"
              >
                <h4 className="font-semibold">
                  Simulated round · slot {gm.slot}
                </h4>
                <p className="text-sm">
                  These results become authoritative only when you publish the
                  round.
                </p>
                <ul>
                  {gm.simulated.map((actor) => (
                    <li key={actor.entityId}>
                      {actor.name}: {actor.hp}/{actor.maxHp} HP
                      {actor.prone ? " · Prone" : ""}
                      {actor.removed ? " · Removed" : ""}
                      {actor.incapacitation
                        ? ` · ${titleCase(actor.incapacitation)}`
                        : ""}
                      {actor.position
                        ? ` · square ${actor.position.point.x}, ${actor.position.point.y}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          {gm && !["published", "completed"].includes(gm.phase) && (
            <CombatantControls
              actors={gm.phase === "planning" ? gm.combatants : gm.simulated}
              controllers={context?.controllers ?? []}
              disabled={disabled || gm.paused}
              command={command}
            />
          )}
          <div className="grid gap-4">
            {encounter.combatants.map((actor) => {
              const plan = gm
                ? gm.plans[actor.entityId]
                : (("plan" in actor ? actor.plan : undefined) as
                    CombatPlan | undefined);
              const profile =
                "profile" in actor
                  ? (actor.profile as CombatProfile)
                  : undefined;
              return (
                <ActorPlan
                  key={actor.entityId}
                  actor={actor}
                  actors={encounter.combatants}
                  plan={plan}
                  profile={profile}
                  editable={
                    encounter.phase === "planning" &&
                    !encounter.paused &&
                    !disabled &&
                    Boolean(gm || plan)
                  }
                  command={command}
                />
              );
            })}
          </div>
          <Details>
            <Summary className="cursor-pointer font-semibold">
              Activity & decision log
            </Summary>
            <ol className="grid gap-2 text-sm">
              {encounter.history.map((entry, index) => (
                <li key={index} className="border-t border-base-300 py-2">
                  <p>
                    Round {entry.round}, slot {entry.slot}: {entry.text}
                  </p>
                  {"rolls" in entry &&
                    (
                      entry.rolls as EncounterState["history"][number]["rolls"]
                    )?.map((roll, i) => (
                      <p key={i}>
                        {roll.label}: {roll.total} ({roll.samples.join(", ")})
                      </p>
                    ))}
                </li>
              ))}
            </ol>
            {!encounter.history.length && <p>No resolved activities yet.</p>}
          </Details>
        </>
      )}
    </section>
  );
}

function CombatSetup({
  context,
  disabled,
  save,
}: {
  context: SessionCombatContext;
  disabled: boolean;
  save: (setup: NonNullable<SessionCombatRequest["setup"]>) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [roster, setRoster] = useState<
    NonNullable<SessionCombatRequest["setup"]>["combatants"]
  >([]);
  const [selected, setSelected] = useState("");
  const [initial, setInitial] =
    useState<
      NonNullable<SessionCombatRequest["setup"]>["combatants"][number]
    >();
  const available = context.setupActors ?? [];
  const actor = available.find((actor) => actor.entityId === selected);
  return (
    <div className="grid gap-3">
      <p>
        Choose prepared actors, then enter their captured combat values. No
        statistics are inferred.
      </p>
      <Label>
        Encounter name
        <Input
          aria-label="Encounter name"
          className={control}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
      </Label>
      {roster.map((row) => (
        <div
          key={row.entityId}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <p>
            {available.find((a) => a.entityId === row.entityId)?.name ??
              "Combatant"}{" "}
            · {row.hp}/{row.maxHp} HP
          </p>
          <Button
            tone="outline"
            disabled={disabled}
            onClick={() => {
              setRoster(roster.filter((a) => a.entityId !== row.entityId));
              setInitial(row);
              setSelected(row.entityId);
            }}
          >
            Remove & revise
          </Button>
        </div>
      ))}
      <Label>
        Add actor
        <Select
          aria-label="Add actor"
          className={control}
          value={selected}
          disabled={disabled}
          onChange={(e) => {
            setInitial(undefined);
            setSelected(e.target.value);
          }}
        >
          <option value="">Choose an actor</option>
          {available
            .filter((a) => !roster.some((r) => r.entityId === a.entityId))
            .map((a) => (
              <option value={a.entityId} key={a.entityId}>
                {a.name}
              </option>
            ))}
        </Select>
      </Label>
      {!available.length && (
        <p>
          Prepare and place an actor in this Instance before starting combat.
        </p>
      )}
      {actor && (
        <SetupActor
          key={actor.entityId}
          actor={actor}
          initial={initial}
          controllers={context.controllers ?? []}
          disabled={disabled}
          add={(row) => {
            setRoster([...roster, row]);
            setSelected("");
          }}
        />
      )}
      <Button
        disabled={disabled || !name.trim() || !roster.length}
        onClick={() => void save({ name: name.trim(), combatants: roster })}
      >
        Create encounter
      </Button>
    </div>
  );
}
function SetupActor({
  actor,
  initial,
  controllers,
  disabled,
  add,
}: {
  actor: SessionCombatSetupActor;
  initial?: NonNullable<SessionCombatRequest["setup"]>["combatants"][number];
  controllers: { id: string; name: string }[];
  disabled: boolean;
  add: (
    actor: NonNullable<SessionCombatRequest["setup"]>["combatants"][number],
  ) => void;
}) {
  const [hp, setHp] = useState(
    initial
      ? String(initial.hp)
      : actor.hp === undefined
        ? ""
        : String(actor.hp),
  );
  const [maxHp, setMaxHp] = useState(
    initial
      ? String(initial.maxHp)
      : actor.maxHp === undefined
        ? ""
        : String(actor.maxHp),
  );
  const [controller, setController] = useState(
    initial?.controllerIds?.[0] ?? actor.controllerIds[0] ?? "",
  );
  const [visible, setVisible] = useState(initial?.visibleToPlayers ?? true);
  const [inactive, setInactive] = useState(initial?.removed ?? false);
  const [profile, setProfile] = useState(
    () => initial?.profile ?? emptyCombatProfile(),
  );
  const [attackCostChosen, setAttackCostChosen] = useState(Boolean(initial));
  const [reach, setReach] = useState(
    initial ? String(initial.profile.reachSquares) : "",
  );
  const [error, setError] = useState("");
  return (
    <Fieldset
      disabled={disabled}
      className="grid gap-3 rounded-box border border-base-300 p-3"
    >
      <legend className="font-semibold">{actor.name}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label>
          Current HP
          <Input
            aria-label="Current HP"
            className={control}
            type="number"
            min={0}
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </Label>
        <Label>
          Maximum HP
          <Input
            aria-label="Maximum HP"
            className={control}
            type="number"
            min={1}
            value={maxHp}
            onChange={(e) => setMaxHp(e.target.value)}
          />
        </Label>
      </div>
      <Label>
        Controller
        <Select
          aria-label="Controller"
          className={control}
          value={controller}
          onChange={(e) => setController(e.target.value)}
        >
          <option value="">GM controlled</option>
          {controllers.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Player visibility
        <Select
          aria-label="Player visibility"
          className={control}
          value={visible ? "visible" : "hidden"}
          onChange={(e) => setVisible(e.target.value === "visible")}
        >
          <option value="visible">Visible</option>
          <option value="hidden">GM only</option>
        </Select>
      </Label>
      <Label>
        Starting participation
        <Select
          aria-label="Starting participation"
          className={control}
          value={inactive ? "inactive" : "active"}
          onChange={(e) => setInactive(e.target.value === "inactive")}
        >
          <option value="active">Active combatant</option>
          <option value="inactive">Inactive until summoned</option>
        </Select>
      </Label>
      {combatFormulaNames.map((key) => (
        <FormulaEditor
          key={key}
          name={titleCase(key)}
          sources={actor.sources}
          value={profile[key]}
          change={(value) => setProfile({ ...profile, [key]: value })}
        />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Label>
          Reach (5-foot squares)
          <Input
            aria-label="Reach (5-foot squares)"
            className={control}
            type="number"
            min={0}
            value={reach}
            onChange={(e) => {
              setReach(e.target.value);
              setProfile({ ...profile, reachSquares: Number(e.target.value) });
            }}
          />
        </Label>
        <Label>
          Movement checkpoints
          <Input
            aria-label="Movement checkpoints"
            className={control}
            type="number"
            min={0}
            max={6}
            value={profile.movementCheckpoints}
            onChange={(e) =>
              setProfile({
                ...profile,
                movementCheckpoints: Number(e.target.value),
              })
            }
          />
        </Label>
      </div>
      <SetupResources profile={profile} change={setProfile} />
      <CostEditor
        name="Attack"
        resources={profile.resources}
        payment="on-completion"
        change={(cost) => {
          if (cost)
            setProfile({
              ...profile,
              attackCost: cost as CombatProfile["attackCost"],
            });
          setAttackCostChosen(Boolean(cost));
        }}
      />
      <SetupReactions
        profile={profile}
        sources={actor.sources}
        change={setProfile}
      />
      <SetupRules profile={profile} change={setProfile} />
      {error && <p role="alert">{error}</p>}
      <Button
        onClick={() => {
          if (
            !attackCostChosen ||
            !reach.trim() ||
            !Number.isInteger(Number(reach)) ||
            Number(reach) < 0 ||
            !hp.trim() ||
            !maxHp.trim() ||
            !Number.isInteger(Number(hp)) ||
            !Number.isInteger(Number(maxHp)) ||
            Number(hp) < 0 ||
            Number(maxHp) < 1 ||
            Number(hp) > Number(maxHp) ||
            combatFormulaNames.some((k) => !profile[k].length)
          ) {
            setError(
              "Choose an attack cost, enter valid current/maximum HP, and add explicit source contributions for every roll (including zero where appropriate).",
            );
            return;
          }
          add({
            entityId: actor.entityId,
            hp: Number(hp),
            maxHp: Number(maxHp),
            profile,
            controllerIds: controller ? [controller] : [],
            visibleToPlayers: visible,
            removed: inactive,
          });
        }}
      >
        Add to encounter
      </Button>
    </Fieldset>
  );
}
function FormulaEditor({
  name,
  sources,
  value,
  change,
}: {
  name: string;
  sources: CombatContribution["source"][];
  value: readonly CombatContribution[];
  change: (value: CombatContribution[]) => void;
}) {
  const [source, setSource] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  return (
    <Details>
      <Summary className="cursor-pointer">
        {name} ·{" "}
        {value.length
          ? value
              .map((c) => `${c.source.name}: ${formatCombatTerms(c.terms)}`)
              .join("; ")
          : "Needs explicit values"}
      </Summary>
      <div className="grid gap-2 py-2">
        {value.map((c, i) => (
          <div key={i} className="flex flex-wrap justify-between gap-2">
            <p>
              {c.source.name} · {formatCombatTerms(c.terms)}
            </p>
            <Button
              tone="outline"
              onClick={() => change(value.filter((_, n) => n !== i))}
            >
              Remove contribution {i + 1}
            </Button>
          </div>
        ))}
        <Label>
          {name} source
          <Select
            aria-label={`${name} source`}
            className={control}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Choose captured source</option>
            {sources.map((s, i) => (
              <option key={`${s.kind}:${s.id}`} value={i}>
                {s.name} · {titleCase(s.kind)}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          {name} dice or constant
          <Input
            aria-label={`${name} dice or constant`}
            className={control}
            placeholder="e.g. 1d20 + 2"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </Label>
        {error && <p role="alert">{error}</p>}
        <Button
          tone="outline"
          onClick={() => {
            try {
              if (source === "") throw new Error("Choose a captured source.");
              change([
                ...value,
                {
                  source: sources[Number(source)],
                  label: name,
                  terms: parseCombatTerms(terms),
                },
              ]);
              setTerms("");
              setError("");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Check this contribution.",
              );
            }
          }}
        >
          Add {name.toLowerCase()} contribution
        </Button>
      </div>
    </Details>
  );
}

type DisplayActor =
  | EncounterState["combatants"][number]
  | PlayerEncounterProjection["combatants"][number];
function ActorPlan({
  actor,
  actors,
  plan,
  profile,
  editable,
  command,
}: {
  actor: DisplayActor;
  actors: readonly DisplayActor[];
  plan?: CombatPlan;
  profile?: CombatProfile;
  editable: boolean;
  command: (input: CommandInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<CombatActivity[] | null>(null);
  const [kind, setKind] = useState<CombatActivity["kind"]>("move");
  const [target, setTarget] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [summonedTarget, setSummonedTarget] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [reactionId, setReactionId] = useState("");
  const [error, setError] = useState("");
  const activities = draft ?? [...(plan?.activities ?? [])];
  const rules =
    profile?.rules ??
    ("availableActivities" in actor ? (actor.availableActivities ?? []) : []);
  const dirty = draft !== null;
  const selectedRule = rules.find((rule) => rule.id === ruleId);
  const permitsSummonedAttack =
    selectedRule &&
    ("completion" in selectedRule
      ? selectedRule.completion.kind === "summon" &&
        Boolean(selectedRule.completion.sameRoundAttackCost)
      : selectedRule.permitsSummonedAttack);
  const reactions =
    profile?.reactions ??
    ("availableReactions" in actor ? (actor.availableReactions ?? []) : []);
  function add() {
    const base = { id: crypto.randomUUID() };
    let activity: CombatActivity;
    if (kind === "move") {
      if (!path.length) {
        setError("Add at least one adjacent square to the route.");
        return;
      }
      activity = { ...base, kind, name: `Move ${path.length * 5} feet`, path };
    } else if (kind === "reaction") {
      const reaction = reactions.find((r) => r.id === reactionId);
      if (!reaction) {
        setError("Choose a captured defense reaction.");
        return;
      }
      activity = {
        ...base,
        kind,
        name: `Reserve ${reaction.name}`,
        ruleId: reaction.id,
        trigger: "incoming-attack",
        targetId: actor.entityId,
        response: { name: reaction.name },
      };
    } else if (kind === "attack") {
      if (!target) {
        setError("Choose a target.");
        return;
      }
      activity = {
        ...base,
        kind,
        name: `Attack ${actors.find((a) => a.entityId === target)?.name ?? "target"}`,
        targetId: target as EntityId,
      };
    } else {
      const rule = rules.find((r) => r.id === ruleId && r.kind === kind);
      if (!rule || !target) {
        setError("Choose a captured completion rule and target.");
        return;
      }
      activity = {
        ...base,
        kind,
        name: rule.name,
        ruleId: rule.id,
        targetId: target as EntityId,
        ...(kind === "summon" && permitsSummonedAttack && summonedTarget
          ? {
              summonedAttack: {
                targetId: summonedTarget as EntityId,
                name: `Attack ${actors.find((a) => a.entityId === summonedTarget)?.name ?? "target"}`,
              },
            }
          : {}),
      };
    }
    setDraft([...activities, activity]);
    setPath([]);
    setError("");
  }
  return (
    <article className="grid min-w-0 gap-3 rounded-box border border-base-300 p-3">
      <h4 className="font-semibold">
        {actor.name} · {actor.hp}/{actor.maxHp} HP
      </h4>
      {"incapacitation" in actor && actor.incapacitation && (
        <p>{titleCase(String(actor.incapacitation))}</p>
      )}
      {"removed" in actor && actor.removed && (
        <p>Removed from this encounter</p>
      )}
      {actor.position && (
        <p className="text-sm">
          Square {actor.position.point.x}, {actor.position.point.y}
        </p>
      )}
      {plan && (
        <p className="text-sm">
          {plan.submitted ? "Submitted" : "Draft"} · {plan.movementUsed}{" "}
          movement checkpoints used
          {profile ? ` of ${profile.movementCheckpoints}` : ""}
          {plan.discarded ? " · Remaining activities discarded" : ""}
        </p>
      )}
      {plan?.armed.length ? (
        <p>Armed: {plan.armed.map((r) => r.response.name).join(", ")}</p>
      ) : null}
      <ol className="grid gap-2">
        {activities.map((activity, index) => (
          <li key={activity.id} className="rounded border border-base-300 p-2">
            <p>
              {index + 1}. {activity.name}{" "}
              {plan?.reactionStates?.[activity.id]
                ? ` · ${titleCase(plan.reactionStates[activity.id].status)}`
                : ""}
              {plan && index < plan.cursor
                ? "· Complete"
                : plan && index === plan.cursor
                  ? "· Current"
                  : ""}
            </p>
            {editable && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  tone="outline"
                  aria-label={`Move activity ${index + 1} earlier`}
                  disabled={!index}
                  onClick={() =>
                    setDraft(reorderCombatActivities(activities, index, -1))
                  }
                >
                  Earlier
                </Button>
                <Button
                  tone="outline"
                  aria-label={`Move activity ${index + 1} later`}
                  disabled={index === activities.length - 1}
                  onClick={() =>
                    setDraft(reorderCombatActivities(activities, index, 1))
                  }
                >
                  Later
                </Button>
                <Button
                  tone="outline"
                  onClick={() =>
                    setDraft(activities.filter((_, i) => i !== index))
                  }
                >
                  Remove activity {index + 1}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!activities.length && (
        <p>No activities declared. An empty submitted plan is idle.</p>
      )}
      {editable && (
        <>
          <Details>
            <Summary className="cursor-pointer font-semibold">
              Add activity
            </Summary>
            <div className="grid gap-3 py-3">
              <Label>
                Activity
                <Select
                  aria-label="Activity"
                  className={control}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as CombatActivity["kind"]);
                    setRuleId("");
                    setSummonedTarget("");
                    setTarget(
                      e.target.value === "death-save" ? actor.entityId : "",
                    );
                  }}
                >
                  <option value="move">Move along squares</option>
                  <option value="attack">Attack</option>
                  <option value="reaction">Reserve defense reaction</option>
                  {(
                    [
                      "potion",
                      "interaction",
                      "spell",
                      "death-save",
                      "summon",
                    ] as const
                  )
                    .filter((k) => rules.some((r) => r.kind === k))
                    .map((k) => (
                      <option key={k} value={k}>
                        {titleCase(k)}
                      </option>
                    ))}
                </Select>
              </Label>
              {kind === "move" ? (
                <>
                  <p className="text-sm">
                    Add squares in order. Each next square must be adjacent,
                    including diagonals. Up to six baseline checkpoints per
                    round.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Label>
                      Square X
                      <Input
                        aria-label="Square X"
                        className={control}
                        type="number"
                        step={1}
                        value={x}
                        onChange={(e) => setX(e.target.value)}
                      />
                    </Label>
                    <Label>
                      Square Y
                      <Input
                        aria-label="Square Y"
                        className={control}
                        type="number"
                        step={1}
                        value={y}
                        onChange={(e) => setY(e.target.value)}
                      />
                    </Label>
                  </div>
                  <p>
                    {path.length
                      ? path.map((p) => `(${p.x}, ${p.y})`).join(" → ")
                      : "Route is empty."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      tone="outline"
                      onClick={() => {
                        const next = { x: Number(x), y: Number(y) };
                        const previous =
                          path.at(-1) ??
                          [...activities]
                            .reverse()
                            .find((a) => a.kind === "move")
                            ?.path.at(-1) ??
                          actor.position?.point;
                        if (
                          !x.trim() ||
                          !y.trim() ||
                          !Number.isInteger(next.x) ||
                          !Number.isInteger(next.y) ||
                          !previous ||
                          Math.max(
                            Math.abs(next.x - previous.x),
                            Math.abs(next.y - previous.y),
                          ) !== 1
                        ) {
                          setError(
                            "Choose a whole-number square adjacent to the previous position.",
                          );
                          return;
                        }
                        setPath([...path, next]);
                        setError("");
                      }}
                    >
                      Add route square
                    </Button>
                    <Button
                      tone="outline"
                      disabled={!path.length}
                      onClick={() => setPath(path.slice(0, -1))}
                    >
                      Undo square
                    </Button>
                  </div>
                </>
              ) : kind === "reaction" ? (
                <>
                  <Label>
                    Defense reaction
                    <Select
                      aria-label="Defense reaction"
                      className={control}
                      value={reactionId}
                      onChange={(e) => setReactionId(e.target.value)}
                    >
                      <option value="">Choose captured reaction</option>
                      {reactions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <p className="text-sm">
                    Triggers relative to an incoming attack after this
                    reservation arms, using its captured timing, defense formula
                    and cost.
                  </p>
                </>
              ) : (
                <>
                  <Label>
                    Target
                    <Select
                      aria-label="Target"
                      className={control}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Choose a target</option>
                      {actors
                        .filter((a) =>
                          kind === "death-save"
                            ? a.entityId === actor.entityId
                            : kind !== "attack" ||
                              a.entityId !== actor.entityId,
                        )
                        .map((a) => (
                          <option key={a.entityId} value={a.entityId}>
                            {a.name}
                          </option>
                        ))}
                    </Select>
                  </Label>
                  {kind === "summon" && permitsSummonedAttack && (
                    <Label>
                      Summoned actor's declared attack target (optional)
                      <Select
                        aria-label="Summoned actor attack target"
                        className={control}
                        value={summonedTarget}
                        onChange={(e) => setSummonedTarget(e.target.value)}
                      >
                        <option value="">Wait until next round</option>
                        {actors
                          .filter((a) => a.entityId !== target)
                          .map((a) => (
                            <option key={a.entityId} value={a.entityId}>
                              {a.name}
                            </option>
                          ))}
                      </Select>
                      <span className="text-sm">
                        A same-round attack requires the rule's explicit
                        capacity cost; otherwise leave this empty.
                      </span>
                    </Label>
                  )}
                  {kind !== "attack" && (
                    <Label>
                      Captured completion rule
                      <Select
                        aria-label="Captured completion rule"
                        className={control}
                        value={ruleId}
                        onChange={(e) => setRuleId(e.target.value)}
                      >
                        <option value="">Choose rule</option>
                        {rules
                          .filter((r) => r.kind === kind)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </Select>
                    </Label>
                  )}
                </>
              )}
              {error && <p role="alert">{error}</p>}
              <Button onClick={add}>Add activity to plan</Button>
            </div>
          </Details>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!dirty}
              onClick={() =>
                void command({
                  kind: "edit-plan",
                  combatantId: actor.entityId,
                  activities,
                  planRevision: plan?.revision ?? 0,
                }).then((saved) => {
                  if (saved) setDraft(null);
                })
              }
            >
              Save draft
            </Button>
            <Button
              disabled={dirty || Boolean(plan?.submitted)}
              onClick={() =>
                void command({
                  kind: "submit-plan",
                  combatantId: actor.entityId,
                  planRevision: plan?.revision ?? 0,
                })
              }
            >
              Submit plan
            </Button>
            {dirty && (
              <Button tone="outline" onClick={() => setDraft(null)}>
                Discard local changes
              </Button>
            )}
          </div>
          {dirty && (
            <p className="text-sm">
              Unsaved local changes. Save the draft before submitting.
            </p>
          )}
        </>
      )}
    </article>
  );
}
function ConflictPanel({
  encounter,
  disabled,
  command,
}: {
  encounter: EncounterState;
  disabled: boolean;
  command: (input: CommandInput) => Promise<boolean>;
}) {
  const conflict = encounter.conflict!;
  const [focalActorId, setFocalActorId] = useState(conflict.focalActorId ?? "");
  const focalActor = encounter.combatants.find(
    (a) => a.entityId === focalActorId,
  );
  const focalPlan = focalActorId ? encounter.plans[focalActorId] : undefined;
  const focalActivity = focalPlan?.activities[focalPlan.cursor];
  const timingNeedsActor = (choice: string) =>
    ["before", "after", "simultaneous"].includes(choice) &&
    !conflict.focalActorId &&
    conflict.kind === "timing";
  const [choice, setChoice] = useState<
    "before" | "after" | "simultaneous" | "custom" | ""
  >("");
  const [reason, setReason] = useState("");
  const [outcomes, setOutcomes] = useState<CombatOutcome[]>([]);
  const [actorId, setActorId] = useState("");
  const [hp, setHp] = useState("");
  const [preview, setPreview] = useState(false);
  const [positionX, setPositionX] = useState("");
  const [positionY, setPositionY] = useState("");
  const [prone, setProne] = useState("");
  const [removed, setRemoved] = useState("");
  const [incapacitation, setIncapacitation] = useState("");
  const affected = encounter.simulated.find((a) => a.entityId === actorId);
  const validHp =
    !hp.trim() ||
    (Number.isInteger(Number(hp)) &&
      Number(hp) >= 0 &&
      Number(hp) <= (affected?.maxHp ?? 0));
  const validPosition =
    (!positionX.trim() && !positionY.trim()) ||
    (Boolean(affected?.position) &&
      positionX.trim() !== "" &&
      positionY.trim() !== "" &&
      Number.isInteger(Number(positionX)) &&
      Number.isInteger(Number(positionY)));
  const hasOutcome =
    hp.trim() || positionX.trim() || prone || removed || incapacitation;

  return (
    <section
      aria-label="Blocking adjudication"
      className="grid gap-3 rounded-box border-2 border-warning p-4"
    >
      <h4 className="font-semibold">
        GM decision needed · slot {conflict.slot}
      </h4>
      <p>{conflict.description}</p>
      <ul className="list-disc pl-5">
        {conflict.facts.map((fact, i) => (
          <li key={i}>{fact}</li>
        ))}
      </ul>
      <Label>
        Resolution
        <Select
          aria-label="Resolution"
          className={control}
          disabled={disabled}
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value as typeof choice);
            setPreview(false);
          }}
        >
          <option value="">Choose an interpretation</option>
          {conflict.choices.map((c) => (
            <option key={c} value={c}>
              {titleCase(c)}
            </option>
          ))}
        </Select>
      </Label>
      {timingNeedsActor(choice) && (
        <Label>
          Focal activity
          <Select
            aria-label="Focal activity"
            className={control}
            value={focalActorId}
            onChange={(e) => {
              setFocalActorId(e.target.value);
              setPreview(false);
            }}
          >
            <option value="">
              Choose the activity whose timing you are deciding
            </option>
            {encounter.combatants
              .filter((a) => conflict.actorIds.includes(a.entityId))
              .filter((a) => {
                const p = encounter.plans[a.entityId];
                return p?.activities[p.cursor]?.kind === "attack";
              })
              .map((a) => (
                <option key={a.entityId} value={a.entityId}>
                  {a.name} ·{" "}
                  {encounter.plans[a.entityId]?.activities[
                    encounter.plans[a.entityId].cursor
                  ]?.name ?? "Attack"}
                </option>
              ))}
          </Select>
        </Label>
      )}
      {focalActor && (
        <p>
          Timing applies to {focalActor.name}:{" "}
          {conflict.focalActivityName ?? focalActivity?.name ?? "Attack"}.
        </p>
      )}
      {choice === "custom" && (
        <>
          <p>
            Author resulting state for involved actors. Blank fields preserve
            their state. This resolves their current activity; later activities
            use the result.
          </p>
          <Label>
            Affected actor
            <Select
              aria-label="Affected actor"
              className={control}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            >
              <option value="">Choose actor</option>
              {encounter.simulated
                .filter((a) => conflict.actorIds.includes(a.entityId))
                .map((a) => (
                  <option value={a.entityId} key={a.entityId}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Label>
          <Label>
            Resulting HP
            <Input
              aria-label="Resulting HP"
              className={control}
              type="number"
              min={0}
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>
              Resulting square X
              <Input
                aria-label="Resulting square X"
                className={control}
                type="number"
                step={1}
                value={positionX}
                onChange={(e) => setPositionX(e.target.value)}
              />
            </Label>
            <Label>
              Resulting square Y
              <Input
                aria-label="Resulting square Y"
                className={control}
                type="number"
                step={1}
                value={positionY}
                onChange={(e) => setPositionY(e.target.value)}
              />
            </Label>
          </div>
          <Label>
            Prone state
            <Select
              aria-label="Prone state"
              className={control}
              value={prone}
              onChange={(e) => setProne(e.target.value)}
            >
              <option value="">Preserve</option>
              <option value="true">Prone</option>
              <option value="false">Standing</option>
            </Select>
          </Label>
          <Label>
            Consciousness
            <Select
              aria-label="Consciousness"
              className={control}
              value={incapacitation}
              onChange={(e) => setIncapacitation(e.target.value)}
            >
              <option value="">Preserve</option>
              <option value="conscious">Conscious</option>
              <option value="unconscious">Unconscious</option>
              <option value="dead">Dead</option>
            </Select>
          </Label>
          <Label>
            Encounter presence
            <Select
              aria-label="Encounter presence"
              className={control}
              value={removed}
              onChange={(e) => setRemoved(e.target.value)}
            >
              <option value="">Preserve</option>
              <option value="true">Removed</option>
              <option value="false">Present</option>
            </Select>
          </Label>
          <Button
            tone="outline"
            disabled={
              disabled || !actorId || !hasOutcome || !validHp || !validPosition
            }
            onClick={() => {
              setOutcomes([
                ...outcomes.filter((o) => o.combatantId !== actorId),
                {
                  combatantId: actorId as EntityId,
                  ...(hp.trim() ? { hp: Number(hp) } : {}),
                  ...(positionX.trim() && affected?.position
                    ? {
                        position: {
                          ...affected.position,
                          point: { x: Number(positionX), y: Number(positionY) },
                        },
                      }
                    : {}),
                  ...(prone ? { prone: prone === "true" } : {}),
                  ...(removed ? { removed: removed === "true" } : {}),
                  ...(incapacitation
                    ? {
                        incapacitation:
                          incapacitation === "conscious"
                            ? null
                            : (incapacitation as "unconscious" | "dead"),
                      }
                    : {}),
                },
              ]);
              setPreview(false);
            }}
          >
            Set custom result
          </Button>
          <ul>
            {outcomes.map((o) => (
              <li key={o.combatantId}>
                {encounter.combatants.find((a) => a.entityId === o.combatantId)
                  ?.name ?? "Combatant"}
                : {o.hp !== undefined ? `${o.hp} HP` : "HP preserved"}
                {o.incapacitation !== undefined
                  ? ` · ${o.incapacitation ?? "Conscious"}`
                  : ""}
                {o.incapacitation !== undefined
                  ? ` · ${o.incapacitation ?? "Conscious"}`
                  : ""}
                {o.position
                  ? ` · square ${o.position.point.x}, ${o.position.point.y}`
                  : ""}
                {o.prone !== undefined
                  ? o.prone
                    ? " · Prone"
                    : " · Standing"
                  : ""}
                {o.removed !== undefined
                  ? o.removed
                    ? " · Removed"
                    : " · Present"
                  : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      <Label>
        Reason (optional)
        <Textarea
          aria-label="Reason (optional)"
          className="w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
        />
      </Label>
      {preview && (
        <p role="status">
          {choice === "custom"
            ? "Apply the listed state changes and conclude the conflicting activities."
            : choice === "before"
              ? `Resolve ${focalActor?.name ?? "the chosen actor"}’s ${conflict.focalActivityName ?? focalActivity?.name ?? "attack"} before the opposing activity.`
              : choice === "after"
                ? `Resolve the opposing activity before ${focalActor?.name ?? "the chosen actor"}’s ${conflict.focalActivityName ?? focalActivity?.name ?? "attack"}.`
                : "Resolve together using the captured pairing rules; further uncertainty may require another decision."}{" "}
          This affects the simulated round until publication.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          tone="outline"
          disabled={
            disabled ||
            !choice ||
            (timingNeedsActor(choice) && !focalActorId) ||
            (choice === "custom" && !outcomes.length)
          }
          onClick={() => setPreview(true)}
        >
          Preview consequences
        </Button>
        <Button
          disabled={
            disabled ||
            !choice ||
            !preview ||
            (timingNeedsActor(choice) && !focalActorId)
          }
          onClick={() => {
            if (choice)
              void command({
                kind: "adjudicate",
                conflictId: conflict.id,
                ...(focalActorId
                  ? { focalActorId: focalActorId as EntityId }
                  : {}),
                choice,
                reason: reason.trim() || undefined,
                ...(choice === "custom" ? { outcomes } : {}),
              });
          }}
        >
          Apply decision & continue
        </Button>
      </div>
    </section>
  );
}

function SetupRules({
  profile,
  change,
}: {
  profile: CombatProfile;
  change: (profile: CombatProfile) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CombatActivityRule["kind"]>("interaction");
  const [completion, setCompletion] = useState("gm-confirmation");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState<AuthoredCost>();
  const [summonedAttackCost, setSummonedAttackCost] = useState<AuthoredCost>();
  const [sameRound, setSameRound] = useState(false);
  return (
    <Details>
      <Summary className="cursor-pointer font-semibold">
        Potion, spell & interaction completion rules
      </Summary>
      <div className="grid gap-3 py-3">
        <p className="text-sm">
          Explicit encounter rules support a fixed HP change or a GM decision.
          Arbitrary spell text is not executed. Impossible activities are
          skipped.
        </p>
        {profile.rules.map((rule, index) => (
          <div key={rule.id}>
            <p>
              {rule.name} · {titleCase(rule.kind)} ·{" "}
              {rule.completion.kind === "apply-hp"
                ? `${rule.completion.amount} HP`
                : "GM decision"}
            </p>
            <Button
              tone="outline"
              onClick={() =>
                change({
                  ...profile,
                  rules: profile.rules.filter((_, i) => i !== index),
                })
              }
            >
              Remove rule {index + 1}
            </Button>
          </div>
        ))}
        <Label>
          Rule name
          <Input
            aria-label="Rule name"
            className={control}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        <Label>
          Rule activity
          <Select
            aria-label="Rule activity"
            className={control}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setCompletion(
                e.target.value === "summon" ? "summon" : "gm-confirmation",
              );
            }}
          >
            <option value="interaction">Interaction</option>
            <option value="potion">Potion</option>
            <option value="spell">Spell</option>
            <option value="death-save">Death save (GM decision)</option>
            <option value="summon">Summon prepared actor</option>
          </Select>
        </Label>
        {kind === "summon" && (
          <>
            <Label>
              Summoned actor participation
              <Select
                aria-label="Summoned actor participation"
                className={control}
                value={sameRound ? "same-round" : "next-round"}
                onChange={(e) => setSameRound(e.target.value === "same-round")}
              >
                <option value="next-round">Acts starting next round</option>
                <option value="same-round">
                  Allow one declared same-round attack
                </option>
              </Select>
            </Label>
            {sameRound && (
              <CostEditor
                name="Summoned attack"
                resources={profile.resources}
                payment="on-completion"
                change={setSummonedAttackCost}
              />
            )}
          </>
        )}
        <Label>
          Completion
          <Select
            aria-label="Completion"
            disabled={kind === "death-save" || kind === "summon"}
            className={control}
            value={completion}
            onChange={(e) => setCompletion(e.target.value)}
          >
            <option value="gm-confirmation">GM adjudicates completion</option>
            <option value="apply-hp">Apply fixed HP change</option>
            {kind === "summon" && (
              <option value="summon">Activate prepared summon</option>
            )}
          </Select>
        </Label>
        {completion === "apply-hp" && (
          <Label>
            HP change (negative for damage)
            <Input
              aria-label="HP change (negative for damage)"
              className={control}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Label>
        )}
        <CostEditor
          name="Rule"
          resources={profile.resources}
          payment="on-completion"
          change={setCost}
        />
        <Button
          tone="outline"
          disabled={
            (sameRound && kind === "summon" && !summonedAttackCost) ||
            !cost ||
            !name.trim() ||
            (completion === "apply-hp" &&
              (!amount.trim() || !Number.isInteger(Number(amount))))
          }
          onClick={() => {
            change({
              ...profile,
              rules: [
                ...profile.rules,
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  kind,
                  impossible: "skip",
                  ...(cost?.kind === "resource"
                    ? {
                        cost: {
                          resource: cost.resource,
                          amount: cost.amount,
                          payment: "on-completion" as const,
                        },
                      }
                    : {}),
                  completion:
                    kind === "summon"
                      ? {
                          kind: "summon",
                          ...(sameRound && summonedAttackCost
                            ? { sameRoundAttackCost: summonedAttackCost }
                            : {}),
                        }
                      : completion === "apply-hp"
                        ? { kind: "apply-hp", amount: Number(amount) }
                        : { kind: "gm-confirmation" },
                },
              ],
            });
            setName("");
            setAmount("");
          }}
        >
          Add completion rule
        </Button>
      </div>
    </Details>
  );
}

type AuthoredCost =
  | { kind: "free" }
  | {
      kind: "resource";
      resource: string;
      amount: number;
      payment: "on-completion" | "on-trigger";
    };
function CostEditor({
  name,
  resources,
  payment,
  change,
}: {
  name: string;
  resources: Readonly<Record<string, number>>;
  payment: "on-completion" | "on-trigger";
  change: (cost: AuthoredCost | undefined) => void;
}) {
  const [kind, setKind] = useState("");
  const [resource, setResource] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="grid gap-2">
      <Label>
        {name} cost
        <Select
          aria-label={`${name} cost`}
          className={control}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            change(e.target.value === "free" ? { kind: "free" } : undefined);
          }}
        >
          <option value="">Choose explicit cost</option>
          <option value="free">No resource cost</option>
          <option value="resource">Spend configured resource</option>
        </Select>
      </Label>
      {kind === "resource" && (
        <>
          <Label>
            {name} resource
            <Select
              aria-label={`${name} resource`}
              className={control}
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                change(undefined);
              }}
            >
              <option value="">Choose resource</option>
              {Object.keys(resources).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {name} cost amount
            <Input
              aria-label={`${name} cost amount`}
              className={control}
              type="number"
              min={1}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                change(undefined);
              }}
            />
          </Label>
          <Button
            tone="outline"
            disabled={
              !resource ||
              !amount.trim() ||
              !Number.isInteger(Number(amount)) ||
              Number(amount) < 1
            }
            onClick={() =>
              change({
                kind: "resource",
                resource,
                amount: Number(amount),
                payment,
              })
            }
          >
            Apply {name.toLowerCase()} resource cost
          </Button>
          <p className="text-sm">
            Paid{" "}
            {payment === "on-trigger"
              ? "when the reaction triggers"
              : "on completion"}
            . Save the cost after changing its resource or amount.
          </p>
        </>
      )}
    </div>
  );
}
function SetupResources({
  profile,
  change,
}: {
  profile: CombatProfile;
  change: (profile: CombatProfile) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [reset, setReset] = useState("");
  return (
    <Details>
      <Summary className="cursor-pointer font-semibold">
        Resource capacity
      </Summary>
      <div className="grid gap-2">
        <p className="text-sm">
          Enter available uses explicitly and choose whether they reset each
          round or remain spent.
        </p>
        <ul>
          {Object.entries(profile.resources).map(([key, value]) => (
            <li key={key}>
              {key}: {value}
              {profile.roundResourceLimits?.[key] !== undefined
                ? " · Resets each round"
                : " · Consumable"}
            </li>
          ))}
        </ul>
        <Label>
          Resource name
          <Input
            aria-label="Resource name"
            className={control}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        <Label>
          Available uses
          <Input
            aria-label="Available uses"
            className={control}
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Label>
        <Label>
          Resource recovery
          <Select
            aria-label="Resource recovery"
            className={control}
            value={reset}
            onChange={(e) => setReset(e.target.value)}
          >
            <option value="">Choose recovery</option>
            <option value="round">Reset to capacity each round</option>
            <option value="consumable">Remain spent across rounds</option>
          </Select>
        </Label>
        <Button
          tone="outline"
          disabled={
            !reset ||
            !name.trim() ||
            !amount.trim() ||
            !Number.isInteger(Number(amount)) ||
            Number(amount) < 0
          }
          onClick={() => {
            const limits = { ...profile.roundResourceLimits };
            if (reset === "round") limits[name.trim()] = Number(amount);
            else delete limits[name.trim()];
            change({
              ...profile,
              roundResourceLimits: limits,
              resources: {
                ...profile.resources,
                [name.trim()]: Number(amount),
              },
            });
            setName("");
            setAmount("");
          }}
        >
          Set resource capacity
        </Button>
      </div>
    </Details>
  );
}
function SetupReactions({
  profile,
  sources,
  change,
}: {
  profile: CombatProfile;
  sources: CombatContribution["source"][];
  change: (profile: CombatProfile) => void;
}) {
  const [name, setName] = useState("");
  const [defense, setDefense] = useState<CombatContribution[]>([]);
  const [cost, setCost] = useState<AuthoredCost>();
  const [timing, setTiming] =
    useState<CombatProfile["reactions"][number]["timing"]>("before");
  return (
    <Details>
      <Summary className="cursor-pointer font-semibold">
        Captured defense reactions
      </Summary>
      <div className="grid gap-3">
        <p className="text-sm">
          A reaction's formula replaces the normal defense roll. Enter the full
          formula, including any base roll. After/replace timings require a GM
          adjudication.
        </p>
        <ul>
          {profile.reactions.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
        <Label>
          Reaction name
          <Input
            aria-label="Reaction name"
            className={control}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        <Label>
          Reaction timing
          <Select
            aria-label="Reaction timing"
            className={control}
            value={timing}
            onChange={(e) => setTiming(e.target.value as typeof timing)}
          >
            <option value="before">Before the attack</option>
            <option value="after">After the attack (GM decision)</option>
            <option value="replace">Replace the attack (GM decision)</option>
          </Select>
        </Label>
        <FormulaEditor
          name="Reaction defense"
          sources={sources}
          value={defense}
          change={setDefense}
        />
        <CostEditor
          name="Reaction"
          resources={profile.resources}
          payment="on-trigger"
          change={setCost}
        />
        <Button
          tone="outline"
          disabled={!name.trim() || !defense.length || !cost}
          onClick={() => {
            if (!cost) return;
            change({
              ...profile,
              reactions: [
                ...profile.reactions,
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  defense,
                  cost: cost as CombatProfile["reactions"][number]["cost"],
                  timing,
                },
              ],
            });
            setName("");
            setDefense([]);
          }}
        >
          Add captured reaction
        </Button>
      </div>
    </Details>
  );
}

function CombatantControls({
  actors,
  controllers,
  disabled,
  command,
}: {
  actors: readonly CombatantState[];
  controllers: { id: string; name: string }[];
  disabled: boolean;
  command: (input: CommandInput) => Promise<boolean>;
}) {
  const [actorId, setActorId] = useState("");
  const [hp, setHp] = useState("");
  const [incapacitation, setIncapacitation] = useState("");
  const [removed, setRemoved] = useState("");
  const [controller, setController] = useState("");
  const actor = actors.find((a) => a.entityId === actorId);
  const valid =
    Boolean(actor) &&
    (hp.trim() || incapacitation || removed || controller) &&
    (!hp.trim() ||
      (Number.isInteger(Number(hp)) &&
        Number(hp) >= 0 &&
        Number(hp) <= actor!.maxHp));
  return (
    <Details>
      <Summary className="cursor-pointer font-semibold">
        GM combatant corrections
      </Summary>
      <Fieldset disabled={disabled} className="grid gap-3 py-3">
        <p className="text-sm">
          Corrections are recorded in the log. During resolution they change the
          simulation. Removal, death, or changing controllers discards
          outstanding activities.
        </p>
        <Label>
          Combatant to correct
          <Select
            aria-label="Combatant to correct"
            className={control}
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
          >
            <option value="">Choose actor</option>
            {actors.map((a) => (
              <option key={a.entityId} value={a.entityId}>
                {a.name} · {a.hp}/{a.maxHp} HP
                {a.incapacitation ? ` · ${a.incapacitation}` : ""}
                {a.removed ? " · Removed" : ""}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          Corrected HP (blank preserves)
          <Input
            aria-label="Corrected HP"
            className={control}
            type="number"
            min={0}
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </Label>
        <Label>
          Corrected consciousness
          <Select
            aria-label="Corrected consciousness"
            className={control}
            value={incapacitation}
            onChange={(e) => setIncapacitation(e.target.value)}
          >
            <option value="">Preserve</option>
            <option value="conscious">Conscious</option>
            <option value="unconscious">Unconscious</option>
            <option value="dead">Dead</option>
          </Select>
        </Label>
        <Label>
          Corrected presence
          <Select
            aria-label="Corrected presence"
            className={control}
            value={removed}
            onChange={(e) => setRemoved(e.target.value)}
          >
            <option value="">Preserve</option>
            <option value="true">Remove</option>
            <option value="false">Return to encounter</option>
          </Select>
        </Label>
        <Label>
          Replace controllers
          <Select
            aria-label="Replace controllers"
            className={control}
            value={controller}
            onChange={(e) => setController(e.target.value)}
          >
            <option value="">Preserve controllers</option>
            <option value="gm">GM controlled</option>
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Label>
        <Button
          disabled={!valid}
          onClick={() =>
            void command({
              kind: "change-combatant",
              combatantId: actorId as EntityId,
              ...(hp.trim() ? { hp: Number(hp) } : {}),
              ...(incapacitation
                ? {
                    incapacitation:
                      incapacitation === "conscious"
                        ? null
                        : (incapacitation as "unconscious" | "dead"),
                  }
                : {}),
              ...(removed ? { removed: removed === "true" } : {}),
              ...(controller
                ? { controllerIds: controller === "gm" ? [] : [controller] }
                : {}),
            }).then((saved) => {
              if (saved) {
                setHp("");
                setIncapacitation("");
                setRemoved("");
                setController("");
              }
            })
          }
        >
          Record combatant correction
        </Button>
      </Fieldset>
    </Details>
  );
}
