import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Badge, Button, FieldError, TextInput, SelectField } from "@aow/ui";
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

export function SettingsLanding({
  areaId,
  settingKey,
}: {
  areaId?: string;
  settingKey?: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [areas, setAreas] = useState<SystemSettingAreaProjection[]>([]);
  const [index, setIndex] = useState<SystemSettingsIndexProjection>();
  const selected =
    areas.find((area) => area.area === areaId) ??
    (!areaId ? areas[0] : undefined);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getSystemSettings()
      .then(async (result) => {
        setIndex(result);
        const loaded = await Promise.all(
          result.areas.map((area) => getSystemSettingArea(area.area)),
        );
        setAreas(loaded);
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

  function open(area: SystemSettingArea) {
    setSearch("");
    void navigate({ to: "/settings/$area", params: { area } });
  }

  async function refresh(next: SystemSettingStatus) {
    setAreas((current) =>
      current.map((area) => ({
        ...area,
        settings: area.settings.map((setting) =>
          setting.key === next.key ? next : setting,
        ),
      })),
    );
    try {
      const [nextIndex, nextArea] = await Promise.all([
        getSystemSettings(),
        selected ? getSystemSettingArea(selected.area) : undefined,
      ]);
      setIndex(nextIndex);
      if (nextArea)
        setAreas((current) =>
          current.map((area) =>
            area.area === nextArea.area ? nextArea : area,
          ),
        );
    } catch {
      // The successful mutation remains visible even if the summary refresh fails.
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 lg:px-10 lg:py-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      {areaId && (
        <Link to="/settings" className="btn btn-ghost mt-3 min-h-11">
          ← All settings
        </Link>
      )}
      {settingKey && selected && (
        <Link
          to="/settings/$area"
          params={{ area: selected.area }}
          className="btn btn-ghost mt-3 min-h-11"
        >
          ← {selected.label}
        </Link>
      )}
      {!busy && areaId && !selected && (
        <p role="alert" className="mt-4">
          This settings area is unavailable. Choose another category.
        </p>
      )}
      {!busy &&
        settingKey &&
        selected &&
        !selected.settings.some((setting) => setting.key === settingKey) && (
          <p role="alert" className="mt-4">
            This setting is unavailable. Return to its category.
          </p>
        )}
      <div className="mt-5 flex items-end gap-2">
        <TextInput
          className="min-h-11 flex-1"
          label="Search settings across categories"
          placeholder="Search labels or help text…"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Button tone="ghost" className="min-h-11" onClick={() => setSearch("")}>
          Clear
        </Button>
      </div>
      <p className="mt-3 text-sm text-base-content/60">
        Save each setting after editing. Changes take effect immediately unless
        a restart is indicated.
      </p>

      {message && (
        <div className="mt-6">
          <FieldError>{message}</FieldError>
        </div>
      )}

      {index && (
        <div className="mt-6 grid gap-5 xl:grid-cols-[12rem_minmax(0,1fr)]">
          <nav
            aria-label="System settings areas"
            className="hidden space-y-2 xl:block"
          >
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

          <div className="min-w-0">
            <div className="mb-4 xl:hidden">
              <SelectField
                className="min-h-11"
                label="Category"
                value={selected?.area ?? ""}
                onChange={(event) =>
                  void open(event.currentTarget.value as SystemSettingArea)
                }
              >
                {index.areas.map((area) => (
                  <option key={area.area} value={area.area}>
                    {area.label}
                  </option>
                ))}
              </SelectField>
            </div>
            {areas.map((area) => {
              const matches = (setting: SystemSettingStatus) =>
                (!settingKey || setting.key === settingKey) &&
                (!search.trim() ||
                  `${setting.label} ${setting.detail} ${area.label}`
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()));
              const visible = search.trim()
                ? area.settings.some(matches)
                : selected?.area === area.area;
              return (
                <section
                  key={area.area}
                  hidden={!visible}
                  className="mb-5 rounded-lg bg-base-200 p-4 lg:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold">{area.label}</h2>
                      <p className="mt-2 text-sm text-base-content/60">
                        {area.description}
                      </p>
                    </div>
                    <StatusBadge status={area.status} />
                  </div>
                  <div className="mt-5 space-y-4">
                    {area.settings.map((setting) => (
                      <div key={setting.key} hidden={!matches(setting)}>
                        {!settingKey && (
                          <Link
                            to="/settings/$area/$settingKey"
                            params={{
                              area: area.area,
                              settingKey: setting.key,
                            }}
                            className="btn btn-ghost min-h-11 mb-2"
                          >
                            Open {setting.label}
                          </Link>
                        )}
                        <SettingCard
                          area={area.area}
                          setting={setting}
                          onChanged={(next) => void refresh(next)}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            {busy && (
              <p role="status" className="text-sm text-base-content/60">
                Loading settings…
              </p>
            )}
            {search.trim() &&
              !areas.some((area) =>
                area.settings.some((setting) =>
                  `${setting.label} ${setting.detail} ${area.label}`
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()),
                ),
              ) && <p>No settings match your search.</p>}
          </div>
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
                className="min-h-11"
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
                className="min-h-11"
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
                className="min-h-11"
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
                className="min-h-11"
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
                className="min-h-11"
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
              className="min-h-11"
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
