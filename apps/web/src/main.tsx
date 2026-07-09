import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { initTheme } from "./features/map/theme";
import { getRouter } from "./router";

initTheme();

// biome-ignore lint: This is the entry point of the application, and it is necessary to render the React application.
const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={getRouter()} />);
}
