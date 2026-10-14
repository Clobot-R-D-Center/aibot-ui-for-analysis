// The adapter interface: everything robot-stack specific (transport, topic
// names, message formats, state codes) lives in an adapter package
// (@aibot/adapter-<name>) that default-exports a StartAdapter.
// The core (main.ts) records what adapters report and relays it to the UI in
// one neutral protocol, so supporting another robot stack means writing one
// adapter, nothing else.

/** Operating mode, normalized from whatever the robot stack reports. */
export type Mode = "idle" | "run" | "pause" | "error" | "other";

export interface Pose {
	/** meters, map frame */
	x: number;
	y: number;
	/** radians, CCW from +x */
	theta: number;
}

/**
 * A site's map meta (graph and zones) in the neutral form the gateway serves
 * as /map/site.json. Map frame, meters.
 */
export interface Site {
	/** Places on the graph; `id` matches what `wait()` reports. */
	nodes: { id: string; name: string; kind: string; x: number; y: number }[];
	/** Drivable connections, drawn along `points` (in the drive direction if one-way). */
	links: { id: string; oneWay: boolean; points: [number, number][] }[];
	/** Areas; `kind` "blocked" and "slow" are drawn apart from the rest. */
	zones: {
		id: string;
		name: string;
		kind: string;
		/** a polygon; false = a polyline */
		closed: boolean;
		points: [number, number][];
	}[];
}

/**
 * An adapter package may also export `loadSite`, reading its stack's own map
 * meta format for the map at `mapYaml` (null = none there). Without it the
 * gateway reads a neutral site.json next to the map.yaml.
 */
export type LoadSite = (mapYaml: string) => Site | null;

/** What an adapter calls; the core dedupes, records and relays. */
export interface FleetSink {
	/** Connectivity and mode. Call on change or periodically; repeats are cheap. */
	state(robot: string, s: { online: boolean; mode: Mode; label: string }): void;
	/** Current poses of any number of robots. */
	poses(poses: { robot: string; pose: Pose }[]): void;
	/** Planned path ahead (map frame); [] clears it. */
	plan(robot: string, points: [number, number][]): void;
	/** Where the robot is waiting for others (e.g. a graph node id); null = not waiting. */
	wait(robot: string, at: string | null): void;
	/** The fleet source itself is gone: every robot's state is unknown from now. */
	lost(): void;
}

export interface Adapter {
	stop(): void;
}

/**
 * An adapter package (@aibot/adapter-<name>) default-exports this. Read its own
 * settings from `env`, call `sink` as data arrives, return a stopper.
 */
export type StartAdapter = (
	sink: FleetSink,
	env: NodeJS.ProcessEnv,
) => Adapter | Promise<Adapter>;
