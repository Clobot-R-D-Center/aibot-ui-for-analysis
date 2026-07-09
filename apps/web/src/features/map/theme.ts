import { useSyncExternalStore } from "react";

// Theme: dark is the working default, light is for export/print (see DESIGN.md).
export type Theme = "dark" | "light";
const KEY = "abaui-theme";
const listeners = new Set<() => void>();

function apply(t: Theme) {
	document.documentElement.setAttribute("data-theme", t);
}

/** Call once before first paint to avoid a flash of the wrong theme.
 *  A `?theme=light|dark` URL param wins (handy for shared/exported links). */
export function initTheme() {
	const param = new URLSearchParams(window.location.search).get("theme");
	const saved = param ?? localStorage.getItem(KEY);
	apply(saved === "light" ? "light" : "dark");
}

function current(): Theme {
	return document.documentElement.getAttribute("data-theme") === "light"
		? "light"
		: "dark";
}

export function setTheme(t: Theme) {
	apply(t);
	localStorage.setItem(KEY, t);
	for (const l of listeners) l();
}

export function toggleTheme() {
	setTheme(current() === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		current,
		() => "dark",
	);
}

// --- Resolve a CSS color (incl. `var(--x)` and oklch) to sRGB for THREE ---
// A probe element resolves custom properties in the current theme; a 1px canvas
// normalizes whatever the browser serializes (rgb / color(srgb) / oklch) to bytes.
let probe: HTMLSpanElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

export interface ResolvedColor {
	rgb: [number, number, number]; // 0..1, linear-ready for THREE.Color.setRGB in sRGB
	alpha: number; // 0..1
}

export function resolveColor(cssValue: string): ResolvedColor {
	if (typeof document === "undefined") return { rgb: [1, 0, 1], alpha: 1 };
	if (!probe) {
		probe = document.createElement("span");
		probe.style.cssText =
			"position:absolute;visibility:hidden;pointer-events:none";
		document.body.appendChild(probe);
	}
	probe.style.color = "";
	probe.style.color = cssValue;
	const concrete = getComputedStyle(probe).color;

	if (!ctx) {
		const cv = document.createElement("canvas");
		cv.width = cv.height = 1;
		ctx = cv.getContext("2d", { willReadFrequently: true });
	}
	if (!ctx) return { rgb: [1, 0, 1], alpha: 1 };
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = "#f0f"; // fallback if `concrete` is unparseable
	ctx.fillStyle = concrete;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	return { rgb: [r / 255, g / 255, b / 255], alpha: a / 255 };
}
