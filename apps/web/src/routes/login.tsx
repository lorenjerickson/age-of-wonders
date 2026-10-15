import { createFileRoute } from "@tanstack/react-router";
import { AstraLogin } from "../AstraLogin";

export const Route = createFileRoute("/login")({ component: AstraLogin });
