import { createFileRoute } from "@tanstack/react-router";
import { SessionCanvasHarness } from "../SessionCanvasHarness";

export const Route = createFileRoute("/_gm/session-canvas-lab")({
  ssr: false,
  component: SessionCanvasRoute,
});

function SessionCanvasRoute() {
  return (
    <div data-testid="session-canvas-client-island">
      <SessionCanvasHarness />
    </div>
  );
}
