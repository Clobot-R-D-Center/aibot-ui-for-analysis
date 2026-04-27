import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { getLocale, shouldRedirect } from "#/paraglide/runtime.js";

import "../styles.css";

export const Route = createRootRoute({
	beforeLoad: async () => {
		document.documentElement.setAttribute("lang", getLocale());

		const decisition = await shouldRedirect({ url: window.location.href });

		if (decisition.redirectUrl) {
			throw redirect({ href: decisition.redirectUrl.href });
		}
	},
	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<Outlet />
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "TanStack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
		</>
	);
}
