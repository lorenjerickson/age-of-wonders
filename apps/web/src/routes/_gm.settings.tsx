import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, FieldError, TextInput } from "@aow/ui";
import type {
  ConfigurationHistoryProjection,
  SystemSettingArea,
  SystemSettingAreaProjection,
  SystemSettingStatus,
  SystemSettingsIndexProjection,
} from "@aow/common";
import { useEffect, useState } from "react";
import {
  getSystemSettingArea,
  getSystemSettingHistory,
  getSystemSettings,
  performSystemSettingAction,
  replaceSystemSecret,
  updateSystemSetting,
} from "../api";

export const Route = createFileRoute("/_gm/settings")({
  component: SettingsLanding,
});

function SettingsLanding() {
  const [index, setIndex] = useState<SystemSettingsIndexProjection>();
  const [selected, setSelected] = useState<SystemSettingAreaProjection>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getSystemSettings()
      .then(async (result) => {
        setIndex(result);
        const first = result.areas[0];
        if (first) setSelected(await getSystemSettingArea(first.area));
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "System settings could not be loaded.",
        );
      })
      .finally(() => setBusy(false));
  }, []);

  async function open(area: SystemSettingArea) {
    setBusy(true);
    setMessage("");
    try {
      setSelected(await getSystemSettingArea(area));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This settings area could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh(next: SystemSettingStatus) {
    setSelected((current) =>
      current
        ? {
            ...current,
            settings: current.settings.map((candidate) =>
              candidate.key === next.key ? next : candidate,
            ),
          }
        : current,
    );
    try {
      const [nextIndex, nextArea] = await Promise.all([
        getSystemSettings(),
        selected ? getSystemSettingArea(selected.area) : undefined,
      ]);
      setIndex(nextIndex);
      if (nextArea) setSelected(nextArea);
    } catch {
      // The successful mutation remains visible even if the summary refresh fails.
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Hosted system
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-base-content/65">
        Installation readiness, integrations, plugins, credentials, storage,
        security, and operations are administered here—outside every World and
        Campaign.
      </p>

      {message && (
        <div className="mt-6">
          <FieldError>{message}</FieldError>
        </div>
      )}

      {index && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <nav aria-label="System settings areas" className="space-y-2">
            <p className="px-2 text-xs font-semibold tracking-wide text-base-content/50 uppercase">
              {index.installationName}
            </p>
            {index.areas.map((area) => (
              <Button
                key={area.area}
                type="button"
                tone={selected?.area === area.area ? "primary" : "ghost"}
                className="h-auto w-full justify-between py-3 text-left"
                disabled={busy}
                onClick={() => void open(area.area)}
              >
                <span>{area.label}</span>
                <StatusBadge status={area.status} />
              </Button>
            ))}
          </nav>

          <section className="rounded-box border border-base-300 bg-base-200 p-6">
            {busy && !selected ? (
              <p className="text-sm text-base-content/55">Loading settings…</p>
            ) : selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold">{selected.label}</h2>
                    <p className="mt-2 text-sm leading-6 text-base-content/60">
                      {selected.description}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="mt-6 space-y-3">
                  {selected.settings.map((setting) => (
                    <SettingCard
                      key={setting.key}
                      area={selected.area}
                      setting={setting}
                      onChanged={(next) => void refresh(next)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}

function SettingCard({
  area,
  setting,
  onChanged,
}: {
  area: SystemSettingArea;
  setting: SystemSettingStatus;
  onChanged: (setting: SystemSettingStatus) => void;
}) {
  const control = setting.control;
  const [value, setValue] = useState(String(control?.value ?? ""));
  const [secret, setSecret] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ConfigurationHistoryProjection>();

  useEffect(() => {
    setValue(String(setting.control?.value ?? ""));
    setSecret("");
  }, [setting]);

  async function apply(
    operation: () => Promise<{ setting: SystemSettingStatus }>,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const result = await operation();
      onChanged(result.setting);
      setSecret("");
      setReason("");
      if (history) {
        setHistory(await getSystemSettingHistory(area, setting.key));
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The setting could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory() {
    if (history) {
      setHistory(undefined);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      setHistory(await getSystemSettingHistory(area, setting.key));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "History could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{setting.label}</h3>
          <p className="mt-1 text-sm leading-6 text-base-content/60">
            {setting.detail}
          </p>
        </div>
        <StatusBadge status={setting.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-base-content/50">
        <span className="rounded-full bg-base-200 px-2 py-1">
          {classificationLabel(setting.classification)}
        </span>
        {setting.source && (
          <span className="rounded-full bg-base-200 px-2 py-1">
            {sourceLabel(setting.source)}
          </span>
        )}
        {setting.valueLabel && (
          <span className="rounded-full bg-base-200 px-2 py-1">
            {setting.valueLabel}
          </span>
        )}
        {setting.restartRequired && (
          <span className="rounded-full bg-warning/15 px-2 py-1 text-warning-content">
            Restart required
          </span>
        )}
      </div>

      {control && (
        <div className="mt-5 grid gap-3 border-t border-base-300 pt-4">
          {control.kind === "secret" ? (
            <TextInput
              type="password"
              autoComplete="new-password"
              label="Replacement secret"
              help="The current value is never displayed. Saving replaces or rotates it immediately."
              value={secret}
              maxLength={1_000}
              onChange={(event) => setSecret(event.currentTarget.value)}
            />
          ) : (
            <TextInput
              type={control.kind === "number" ? "number" : "text"}
              label="Value"
              value={value}
              min={control.minimum}
              max={control.maximum}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          )}
          <TextInput
            label="Change reason (optional)"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          {message && <FieldError>{message}</FieldError>}
          <div className="flex flex-wrap gap-2">
            {control.kind === "secret" ? (
              <Button
                type="button"
                tone="primary"
                size="sm"
                loading={busy}
                disabled={secret.trim().length < 8}
                onClick={() =>
                  void apply(() =>
                    replaceSystemSecret(area, setting.key, {
                      expectedRevision: control.expectedRevision,
                      secret,
                      reason: reason.trim() || undefined,
                    }),
                  )
                }
              >
                {setting.source === "application"
                  ? "Rotate secret"
                  : "Save secret"}
              </Button>
            ) : (
              <Button
                type="button"
                tone="primary"
                size="sm"
                loading={busy}
                disabled={!value.trim()}
                onClick={() =>
                  void apply(() =>
                    updateSystemSetting(area, setting.key, {
                      expectedRevision: control.expectedRevision,
                      value: control.kind === "number" ? Number(value) : value,
                      reason: reason.trim() || undefined,
                    }),
                  )
                }
              >
                Save
              </Button>
            )}
            {control.canTest && (
              <Button
                type="button"
                tone="outline"
                size="sm"
                loading={busy}
                onClick={() =>
                  void apply(() =>
                    performSystemSettingAction(area, setting.key, "test", {
                      expectedRevision: control.expectedRevision,
                      reason: reason.trim() || undefined,
                    }),
                  )
                }
              >
                Test connection
              </Button>
            )}
            {control.canReset && (
              <Button
                type="button"
                tone="ghost"
                size="sm"
                loading={busy}
                onClick={() =>
                  void apply(() =>
                    performSystemSettingAction(area, setting.key, "reset", {
                      expectedRevision: control.expectedRevision,
                      reason: reason.trim() || undefined,
                    }),
                  )
                }
              >
                Use deployment value
              </Button>
            )}
            {control.canDisable && setting.source !== "disabled" && (
              <Button
                type="button"
                tone="ghost"
                size="sm"
                loading={busy}
                onClick={() => {
                  if (!window.confirm(`Disable ${setting.label}?`)) return;
                  void apply(() =>
                    performSystemSettingAction(area, setting.key, "revoke", {
                      expectedRevision: control.expectedRevision,
                      reason: reason.trim() || undefined,
                    }),
                  );
                }}
              >
                Revoke and disable
              </Button>
            )}
            <Button
              type="button"
              tone="ghost"
              size="sm"
              loading={busy}
              onClick={() => void toggleHistory()}
            >
              {history ? "Hide history" : "View history"}
            </Button>
          </div>
          {history && (
            <div className="mt-2 border-t border-base-300 pt-3">
              <h4 className="text-sm font-semibold">Change history</h4>
              {history.revisions.length ? (
                <ul className="mt-2 space-y-2 text-xs text-base-content/60">
                  {history.revisions.map((revision, index) => (
                    <li key={`${revision.createdAt}-${index}`}>
                      {title(revision.action.replaceAll("-", " "))} by{" "}
                      {revision.actorName} ·{" "}
                      {new Date(revision.createdAt).toLocaleString()}
                      {revision.reason ? ` — ${revision.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-base-content/50">
                  No application-managed changes yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: "ready" | "attention" | "disabled" | "unavailable";
}) {
  const tone =
    status === "ready"
      ? "success"
      : status === "attention"
        ? "warning"
        : status === "unavailable"
          ? "error"
          : "neutral";
  return <Badge tone={tone}>{title(status)}</Badge>;
}

function classificationLabel(value: string) {
  return value
    .split("-")
    .map((part) => title(part))
    .join(" ");
}

function sourceLabel(value: string) {
  if (value === "application") return "Application override";
  if (value === "deployment") return "Deployment value";
  if (value === "default") return "Product default";
  if (value === "disabled") return "Explicitly disabled";
  return "Observed";
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
