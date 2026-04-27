import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { getRouter } from "./router";

// biome-ignore lint: This is the entry point of the application, and it is necessary to render the React application.
const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={getRouter()} />);
}
