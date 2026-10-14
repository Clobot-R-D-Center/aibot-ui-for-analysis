import type { XY } from "./overlays/overlay-data";

// A site's map meta — graph and zones — as the gateway serves it at
// /map/site.json (Site in packages/fleet-adapter). Map frame, meters.

export interface SiteNode {
	id: string;
	name: string;
	kind: string;
	x: number;
	y: number;
}
export interface SiteLink {
	id: string;
	oneWay: boolean;
	points: XY[];
}
export interface SiteZone {
	id: string;
	name: string;
	kind: string;
	closed: boolean;
	points: XY[];
}
export interface Site {
	nodes: SiteNode[];
	links: SiteLink[];
	zones: SiteZone[];
}

export const NO_SITE: Site = { nodes: [], links: [], zones: [] };

// Off the wire, so nothing is trusted: a malformed entry is dropped, the rest kept.
// biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, narrowed field by field below
type Wire = any;

const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Wire[] => (Array.isArray(v) ? v : []);

function points(v: unknown, min: number): XY[] | null {
	const pts = list(v);
	return pts.length >= min &&
		pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))
		? pts.map((p) => [p[0], p[1]])
		: null;
}

export function parseSite(json: unknown): Site {
	const s = (json ?? {}) as Wire;
	return {
		nodes: list(s.nodes).flatMap((n) =>
			n && typeof n.id === "string" && isNum(n.x) && isNum(n.y)
				? [{ id: n.id, name: str(n.name), kind: str(n.kind), x: n.x, y: n.y }]
				: [],
		),
		links: list(s.links).flatMap((l) => {
			const pts = points(l?.points, 2);
			return pts && typeof l.id === "string"
				? [{ id: l.id, oneWay: l.oneWay === true, points: pts }]
				: [];
		}),
		zones: list(s.zones).flatMap((z) => {
			const closed = z?.closed !== false;
			const pts = points(z?.points, closed ? 3 : 2);
			return pts && typeof z.id === "string"
				? [
						{
							id: z.id,
							name: str(z.name),
							kind: str(z.kind),
							closed,
							points: pts,
						},
					]
				: [];
		}),
	};
}
