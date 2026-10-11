import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@aow/ui";
import "./sessionWorkspace.css";

/** One persistent map, with independently scrolling context on either edge. */
export function SessionWorkspace({
  title,
  gm,
  players,
  children,
  utilities,
  participantLabel = "Players",
}: {
  title: string;
  gm?: ReactNode;
  players: ReactNode;
  children: ReactNode;
  utilities?: ReactNode;
  participantLabel?: string;
}) {
  const [drawer, setDrawer] = useState<"gm" | "players" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  function close() {
    setDrawer(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  useEffect(() => {
    if (!drawer) return;
    root.current
      ?.querySelector<HTMLElement>(`[data-dock="${drawer}"] button`)
      ?.focus();
    const query = window.matchMedia("(min-width: 80rem)");
    const reset = () => {
      if (query.matches) setDrawer(null);
    };
    query.addEventListener("change", reset);
    return () => query.removeEventListener("change", reset);
  }, [drawer]);
  return (
    <div
      ref={root}
      className={`session-workspace ${gm ? "" : "session-workspace-participant"}`}
      data-open-dock={drawer ?? "none"}
    >
      <header className="session-workspace-bar" inert={drawer !== null}>
        {gm && (
          <Button
            className="session-dock-trigger"
            aria-expanded={drawer === "gm"}
            aria-controls="session-gm-dock"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setDrawer("gm");
            }}
          >
            GM
          </Button>
        )}
        <h1 className="min-w-0 flex-1 truncate font-semibold">{title}</h1>
        <Button
          className="session-dock-trigger"
          aria-expanded={drawer === "players"}
          aria-controls="session-players-dock"
          onClick={(event) => {
            opener.current = event.currentTarget;
            setDrawer("players");
          }}
        >
          {participantLabel}
        </Button>
      </header>
      <div className="session-workspace-body">
        {drawer && (
          <div
            className="session-dock-scrim"
            onClick={close}
            aria-hidden="true"
          />
        )}
        {(["gm", "players"] as const)
          .filter((side) => side !== "gm" || gm)
          .map((side) => (
            <aside
              key={side}
              id={`session-${side}-dock`}
              data-dock={side}
              className={`session-role-dock session-role-dock-${side}`}
              role={drawer === side ? "dialog" : undefined}
              aria-modal={drawer === side ? true : undefined}
              aria-label={
                side === "gm" ? "Game master context" : "Players and actors"
              }
              inert={drawer !== null && drawer !== side}
              onKeyDown={(event) => {
                if (drawer !== side) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                }
                if (event.key !== "Tab") return;
                const nodes = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"],summary',
                  ),
                ).filter((node) => node.getClientRects().length);
                const first = nodes[0],
                  last = nodes.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                }
                if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}
            >
              <div className="session-dock-heading">
                <h2 className="font-semibold">
                  {side === "gm"
                    ? "Game master"
                    : gm
                      ? "Players and actors"
                      : participantLabel}
                </h2>
                <Button className="session-dock-trigger" onClick={close}>
                  Close
                </Button>
              </div>
              <div className="session-dock-scroll">
                {side === "gm" ? gm : players}
              </div>
              {side === "gm" && utilities && (
                <div className="session-dock-utilities">{utilities}</div>
              )}
            </aside>
          ))}
        <div
          className="session-map-viewport"
          aria-label="Location map"
          tabIndex={0}
          inert={drawer !== null}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
