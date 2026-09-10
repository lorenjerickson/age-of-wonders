import { ContextualBreadcrumbs } from "./ContextualNavigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Alert, Badge, Button } from "@aow/ui";
import {
  getCampaignInstanceContinuation,
  updateCampaignInstanceLifecycle,
  validateCampaignInstance,
  type CampaignInstanceContinuation,
  type CampaignInstanceDetail,
  type CampaignInstanceReadiness,
} from "./api";
import { campaignInstanceNavigationForPath } from "./campaignInstanceModel";
import { statusLabel } from "./campaignLibraryModel";
import { InternalLink, RouterButtonLink } from "./navigation";
import { quickStartStorageKey, quickStartSuffix } from "./quickStartModel";

interface InstanceContextValue {
  instance: CampaignInstanceDetail;
  readiness?: CampaignInstanceReadiness;
  continuation?: CampaignInstanceContinuation;
  refresh(): Promise<void>;
}

const InstanceContext = createContext<InstanceContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useCampaignInstance() {
  const value = useContext(InstanceContext);
  if (!value)
    throw new Error(
      "Campaign Instance pages require their management workspace",
    );
  return value;
}

export function CampaignInstanceProvider({
  instance,
  children,
}: {
  instance: CampaignInstanceDetail;
  children: ReactNode;
}) {
  const [readiness, setReadiness] = useState<CampaignInstanceReadiness>();
  const [continuation, setContinuation] =
    useState<CampaignInstanceContinuation>();
  async function refresh() {
    const [nextReadiness, nextContinuation] = await Promise.all([
      validateCampaignInstance(instance.campaignDefinitionId, instance.id),
      getCampaignInstanceContinuation(
        instance.campaignDefinitionId,
        instance.id,
      ),
    ]);
    setReadiness(nextReadiness);
    setContinuation(nextContinuation);
  }
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [instance.campaignDefinitionId, instance.id]);
  return (
    <InstanceContext.Provider
      value={{ instance, readiness, continuation, refresh }}
    >
      {children}
    </InstanceContext.Provider>
  );
}

export function CampaignInstanceContextBar() {
  const { instance, continuation } = useCampaignInstance();
  const snapshot = instance.currentSnapshot;
  const suffix = quickStartSuffix(useLocation().searchStr);
  return (
    <>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100/95 px-6 py-3 pl-16 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold"
            title={instance.name || "Unnamed Campaign Instance"}
          >
            {instance.name.trim() || "Unnamed Campaign Instance"}
          </p>
          <p className="text-xs text-base-content/60">
            {snapshot
              ? `${snapshot.campaignDefinition.name || "Unnamed Campaign Definition"} revision ${snapshot.campaignDefinition.revisionNumber} · ${snapshot.worldDefinition.name || "Unnamed World"} revision ${snapshot.worldDefinition.revisionNumber}`
              : "Captured Campaign and World unavailable"}
          </p>
        </div>
        <Badge outline>{statusLabel(instance.status)}</Badge>
        {continuation?.enabled && continuation.session ? (
          <RouterButtonLink
            href={`/campaigns/instances/${encodeURIComponent(instance.id)}/${continuation.kind === "continue" || continuation.kind === "resume" ? "run" : "sessions"}/${encodeURIComponent(continuation.session.id)}${suffix}`}
            tone="primary"
            size="sm"
          >
            {continuation.label}
          </RouterButtonLink>
        ) : continuation?.kind === "plan-session" ||
          continuation?.kind === "choose" ? (
          <RouterButtonLink
            href={`/campaigns/instances/${encodeURIComponent(instance.id)}/sessions${suffix}`}
            tone="primary"
            size="sm"
          >
            Plan Session
          </RouterButtonLink>
        ) : null}
      </header>
      <ContextualBreadcrumbs />
    </>
  );
}

export function CampaignInstanceSecondaryNavigation({
  gmScope,
}: {
  gmScope: string;
}) {
  const { instance } = useCampaignInstance();
  const location = useLocation();
  const groups = campaignInstanceNavigationForPath(
    instance.id,
    location.pathname,
  );
  const activeKey = groups.find(({ active }) => active)?.key;
  const storageKey = `${quickStartStorageKey(gmScope)}.campaign-instance-navigation.${encodeURIComponent(instance.id)}`;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(activeKey ? [activeKey] : []),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const suffix = quickStartSuffix(location.searchStr);
  const base = `/campaigns/instances/${encodeURIComponent(instance.id)}`;
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      if (Array.isArray(saved))
        setExpanded(
          new Set(saved.filter((value) => typeof value === "string")),
        );
    } catch {
      /* Navigation preferences are optional. */
    }
  }, [storageKey]);
  useEffect(() => {
    if (activeKey) setExpanded((current) => new Set([...current, activeKey]));
  }, [activeKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {
      /* Navigation remains usable without local storage. */
    }
  }, [expanded, storageKey]);
  return (
    <aside className="border-b border-base-300 bg-secondary/[0.04] p-4 lg:min-h-full lg:border-r lg:border-b-0 lg:p-5">
      <div className="mb-5 min-w-0 px-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-secondary uppercase">
          Campaign Instance
        </p>
        <p
          className="mt-2 truncate text-lg font-semibold"
          title={instance.name}
        >
          {instance.name || "Unnamed Campaign Instance"}
        </p>
        <p className="mt-1 text-xs text-base-content/60">Instance management</p>
      </div>
      <nav
        aria-label={`${instance.name || "Campaign Instance"} overview`}
        className="mb-3 px-1"
      >
        <ul className="menu gap-1 p-0">
          <li>
            <InternalLink
              href={`${base}${suffix}`}
              aria-current={location.pathname === base ? "page" : undefined}
            >
              Overview
            </InternalLink>
          </li>
        </ul>
      </nav>
      <Button
        tone="outline"
        className="mb-3 min-h-11 w-full justify-between lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="campaign-instance-navigation"
        onClick={() => setMobileOpen((open) => !open)}
      >
        Campaign navigation{" "}
        <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </Button>
      <nav
        id="campaign-instance-navigation"
        aria-label={`${instance.name || "Campaign Instance"} management`}
        className={mobileOpen ? "block" : "hidden lg:block"}
      >
        <ul className="space-y-1">
          {groups.map((group) => {
            const open = expanded.has(group.key);
            const controls = `instance-navigation-${group.key}`;
            return (
              <li key={group.key}>
                <div
                  className={`flex items-center rounded-lg ${group.active ? "bg-secondary/10 text-secondary" : "hover:bg-base-200"}`}
                >
                  <InternalLink
                    href={`${group.children[0]!.href}${suffix}`}
                    className="min-w-0 flex-1 px-3 py-2 text-sm font-semibold"
                  >
                    {group.label}
                  </InternalLink>
                  <Button
                    tone="ghost"
                    size="xs"
                    className="mr-1"
                    aria-expanded={open}
                    aria-controls={controls}
                    aria-label={`${open ? "Collapse" : "Expand"} ${group.label} navigation`}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true">{open ? "−" : "+"}</span>
                  </Button>
                </div>
                {open && (
                  <ul id={controls} className="mt-1 space-y-1 px-2 pb-2">
                    {group.children.map((child) => (
                      <li key={child.label}>
                        <InternalLink
                          href={`${child.href}${suffix}`}
                          aria-current={
                            location.pathname === child.href ||
                            location.pathname.startsWith(`${child.href}/`)
                              ? "page"
                              : undefined
                          }
                          className="block rounded-md px-3 py-1.5 text-sm text-base-content/65 hover:bg-base-200"
                        >
                          {child.label}
                        </InternalLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <InternalLink
        className="link mt-5 inline-block px-2 text-sm"
        href={`/campaigns${suffix}`}
      >
        Back to Campaigns
      </InternalLink>
    </aside>
  );
}

export function CampaignInstanceLifecycleActions() {
  const { instance } = useCampaignInstance();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = instance.status.toLowerCase();
  const actions =
    status === "preparing"
      ? ["activate"]
      : status === "active"
        ? ["pause", "conclude"]
        : status === "paused"
          ? ["activate", "conclude"]
          : status === "concluded"
            ? ["archive"]
            : status === "archived"
              ? ["restore"]
              : [];
  if (!actions.length || instance.metadataRevision === undefined) return null;
  async function update(action: string) {
    setBusy(true);
    setMessage("");
    try {
      await updateCampaignInstanceLifecycle(
        instance.campaignDefinitionId,
        instance.id,
        {
          targetStatus: (action === "activate"
            ? "active"
            : action === "restore"
              ? "concluded"
              : action) as CampaignInstanceDetail["status"],
          expectedMetadataRevision: instance.metadataRevision,
        },
      );
      await router.invalidate();
    } catch {
      setMessage(
        "The lifecycle changed elsewhere or the Instance is not ready. Reload and review its readiness before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-10 border-t border-base-300 pt-7"
      aria-labelledby="instance-lifecycle-heading"
    >
      <h2 id="instance-lifecycle-heading" className="text-lg font-semibold">
        Lifecycle
      </h2>
      <p className="mt-2 text-sm text-base-content/60">
        Lifecycle changes affect whether this Instance can be prepared or
        continued. They never edit its captured Definition.
      </p>
      {message && (
        <Alert tone="error" className="mt-4" aria-live="polite">
          {message}
        </Alert>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action}
            tone={
              action === "archive" || action === "conclude"
                ? "outline"
                : "primary"
            }
            disabled={busy}
            onClick={() => void update(action)}
          >
            {action === "activate" && status === "paused"
              ? "Resume Instance"
              : `${action.charAt(0).toUpperCase()}${action.slice(1)} Instance`}
          </Button>
        ))}
      </div>
    </section>
  );
}
