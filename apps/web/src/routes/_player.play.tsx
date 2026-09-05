import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_player/play")({ component: Outlet });
