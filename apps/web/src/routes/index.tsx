import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "#/features/dashboard/DashboardShell";

export const Route = createFileRoute("/")({ component: DashboardShell });
