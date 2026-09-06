import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, FieldError } from "@aow/ui";
import type {
  SystemSettingArea,
  SystemSettingAreaProjection,
  SystemSettingsIndexProjection,
} from "@aow/common";
import { useEffect, useState } from "react";
import { getSystemSettingArea, getSystemSettings } from "../api";

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
                    <article
                      key={setting.key}
                      className="rounded-box border border-base-300 bg-base-100 p-4"
                    >
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
                    </article>
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

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
