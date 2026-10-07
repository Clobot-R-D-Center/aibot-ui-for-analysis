import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			outputStructure: "message-modules",
			cookieName: "PARAGLIDE_LOCALE",
			strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
			urlPatterns: [
				{
					pattern: "/:path(.*)?",
					localized: [
						["en", "/en/:path(.*)?"],
						["ko", "/ko/:path(.*)?"],
					],
				},
			],
		}),
		devtools({
			// Source injection adds data-tsd-source to every JSX element; React
			// Three Fiber reads a dashed prop as a nested path (data.tsd.source)
			// and throws. Skip the files that render three.js scenes.
			injectSource: {
				enabled: true,
				ignore: { files: [/\/src\/features\/map\/(?!MapPanel\.tsx)/] },
			},
		}),
		tailwindcss(),
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
	],
});

export default config;
