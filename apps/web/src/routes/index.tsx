import { createFileRoute, redirect } from "@tanstack/react-router";

// The dashboard opens on the map canvas — the product's hero surface.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/map" });
	},
});
