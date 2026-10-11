import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

export const SIDEBAR_DEFAULT_WIDTH = 224;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;
const STORAGE_KEY = "aow.secondaryNavigation.width";
const CONTENT_MIN_WIDTH = 480;
const DIVIDER_WIDTH = 12;

export function sidebarMaximumWidth(
  viewportWidth: number,
  toolsVisible: boolean,
) {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(
      SIDEBAR_MAX_WIDTH,
      viewportWidth -
        (toolsVisible ? 288 : 0) -
        CONTENT_MIN_WIDTH -
        DIVIDER_WIDTH,
    ),
  );
}

export function clampSidebarWidth(width: number, maximum = SIDEBAR_MAX_WIDTH) {
  return Math.min(
    maximum,
    Math.max(
      SIDEBAR_MIN_WIDTH,
      Number.isFinite(width) ? width : SIDEBAR_DEFAULT_WIDTH,
    ),
  );
}

export function useSidebarResize(toolsVisible: boolean) {
  const [preferredWidth, setPreferredWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const maximum = sidebarMaximumWidth(viewportWidth, toolsVisible);
  const width = clampSidebarWidth(preferredWidth, maximum);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null && stored.trim() !== "")
        setPreferredWidth(clampSidebarWidth(Number(stored)));
    } catch {
      // Resizing remains available when browser storage is restricted.
    }
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  function updateWidth(next: number) {
    const value = clampSidebarWidth(next, maximum);
    setPreferredWidth(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Persisting a preference is optional.
    }
  }

  return {
    width,
    resizing,
    separatorProps: {
      role: "separator" as const,
      tabIndex: 0,
      "aria-label": "Resize secondary navigation",
      "aria-controls": "shell-secondary-navigation",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": SIDEBAR_MIN_WIDTH,
      "aria-valuemax": maximum,
      "aria-valuenow": width,
      "aria-valuetext": `${width} pixels`,
      title:
        "Drag to resize navigation, or use arrow keys. Double-click to reset.",
      onDoubleClick: () => updateWidth(SIDEBAR_DEFAULT_WIDTH),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const next =
          event.key === "ArrowLeft"
            ? width - 16
            : event.key === "ArrowRight"
              ? width + 16
              : event.key === "Home"
                ? SIDEBAR_MIN_WIDTH
                : event.key === "End"
                  ? maximum
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        updateWidth(next);
      },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
        };
        setResizing(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        updateWidth(
          drag.current.startWidth + event.clientX - drag.current.startX,
        );
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        setResizing(false);
      },
      onPointerCancel: () => {
        drag.current = null;
        setResizing(false);
      },
      onLostPointerCapture: () => {
        drag.current = null;
        setResizing(false);
      },
    },
  };
}
