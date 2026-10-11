import { useEffect, useRef, useState } from "react";
import {
  heartbeatCampaignSession,
  joinCampaignSession,
  leaveCampaignSession,
} from "./api";

type PresenceState = { present: boolean; error: string };
type LeaseApi = {
  join: () => Promise<unknown>;
  heartbeat: () => Promise<unknown>;
  leave: () => Promise<unknown>;
};

/** Serialized lease operations prevent a late heartbeat from undoing a leave. */
export function createSessionPresenceLease(api: LeaseApi) {
  let state: PresenceState = { present: false, error: "" };
  let tail: Promise<unknown> = Promise.resolve();
  let listener: ((state: PresenceState) => void) | undefined;
  let refresh: (() => void | Promise<void>) | undefined;
  let heartbeatPending = false;
  let activationPending = false;
  let automatic = false;
  let wantsPresence = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposal: ReturnType<typeof setTimeout> | undefined;
  const publish = (next: PresenceState) => {
    state = next;
    listener?.(state);
  };
  function execute(operation: keyof LeaseApi, reconnect = false) {
    const result = tail.then(async () => {
      try {
        try {
          await api[operation]();
        } catch (caught) {
          if (operation !== "heartbeat" || !automatic || !wantsPresence)
            throw caught;
          // GM-controlled play reconnects using the GM's own authenticated identity.
          await api.join();
        }
        publish({ present: operation !== "leave", error: "" });
        // Refresh failures are owned by the page and must not revoke a valid lease.
        void Promise.resolve()
          .then(() => refresh?.())
          .catch(() => undefined);
      } catch (caught) {
        publish({
          present: operation === "leave" ? state.present : false,
          error: reconnect
            ? ""
            : caught instanceof Error
              ? caught.message
              : "Session presence could not be updated.",
        });
        throw caught;
      }
    });
    tail = result.catch(() => undefined);
    return result;
  }
  return {
    join: () => {
      wantsPresence = true;
      return execute("join");
    },
    leave: () => {
      wantsPresence = false;
      return execute("leave");
    },
    attach(
      nextListener: (state: PresenceState) => void,
      nextRefresh: () => void | Promise<void>,
      reconnect: boolean,
      onDispose: () => void,
      autoJoin = false,
    ) {
      if (autoJoin && !automatic) wantsPresence = true;
      automatic = autoJoin;
      if (disposal) clearTimeout(disposal);
      disposal = undefined;
      listener = nextListener;
      refresh = nextRefresh;
      listener(state);
      if (timer) clearInterval(timer);
      if (!state.present) {
        if (automatic && wantsPresence && !activationPending) {
          activationPending = true;
          void execute(reconnect ? "heartbeat" : "join")
            .catch(() => undefined)
            .finally(() => {
              activationPending = false;
            });
        } else if (!automatic && reconnect)
          void execute("heartbeat", true).catch(() => undefined);
      }
      timer = setInterval(() => {
        if (
          (!state.present && !(automatic && wantsPresence)) ||
          heartbeatPending
        )
          return;
        heartbeatPending = true;
        void execute(state.present ? "heartbeat" : "join")
          .catch(() => undefined)
          .finally(() => {
            heartbeatPending = false;
          });
      }, 45_000);
      return () => {
        if (listener !== nextListener) return;
        listener = undefined;
        refresh = undefined;
        if (timer) clearInterval(timer);
        timer = undefined;
        // Same-tick route/StrictMode remounts retain the lease. A true departure
        // releases only this controller's connection after queued work settles.
        disposal = setTimeout(() => {
          wantsPresence = false;
          onDispose();
          void execute("leave").catch(() => undefined);
        }, 0);
      };
    },
  };
}

type Lease = ReturnType<typeof createSessionPresenceLease>;
const leases = new Map<string, Lease>();

/** Normal participants join explicitly; GM-controlled play opts into automatic presence. */
export function useSessionPresence({
  campaignInstanceId,
  sessionId,
  onRefresh,
  autoJoin = false,
}: {
  campaignInstanceId: string;
  sessionId: string;
  onRefresh: () => void | Promise<void>;
  autoJoin?: boolean;
}) {
  const [state, setState] = useState<PresenceState>({
    present: false,
    error: "",
  });
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const leaseRef = useRef<Lease | undefined>(undefined);
  useEffect(() => {
    const storageKey = `aow.session.${sessionId}.presence`;
    const scope = `${campaignInstanceId}/${sessionId}`;
    let key: string | null = null;
    try {
      key = sessionStorage.getItem(storageKey);
    } catch {
      /* memory-only lease */
    }
    const reconnect = Boolean(key);
    let lease = leases.get(scope);
    if (!lease) {
      key ??= `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const connectionKey = key;
      try {
        sessionStorage.setItem(storageKey, key);
      } catch {
        /* memory-only lease */
      }
      lease = createSessionPresenceLease({
        join: () =>
          joinCampaignSession(campaignInstanceId, sessionId, connectionKey),
        heartbeat: () =>
          heartbeatCampaignSession(
            campaignInstanceId,
            sessionId,
            connectionKey,
          ),
        leave: () =>
          leaveCampaignSession(campaignInstanceId, sessionId, connectionKey),
      });
      leases.set(scope, lease);
    }
    const current = lease;
    leaseRef.current = current;
    const detach = current.attach(
      setState,
      () => refreshRef.current(),
      reconnect,
      () => {
        if (leases.get(scope) === current) leases.delete(scope);
        // A subsequent mount uses a fresh key, so an in-flight release cannot
        // remove its connection. Reload before cleanup can still restore the key.
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* memory-only lease */
        }
      },
      autoJoin,
    );
    return () => {
      leaseRef.current = undefined;
      detach();
    };
  }, [campaignInstanceId, sessionId, autoJoin]);
  return {
    ...state,
    join: () =>
      leaseRef.current?.join() ??
      Promise.reject(new Error("The Session is still opening.")),
    leave: () => leaseRef.current?.leave() ?? Promise.resolve(),
  };
}
