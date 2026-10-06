// The adapter interface: everything robot-stack specific (transport, topic
// names, message formats, state codes) lives in an adapter package
// (@aibot/adapter-<name>) that default-exports a StartAdapter.
// The core (main.ts) records what adapters report and relays it to the UI in
// one neutral protocol, so supporting another robot stack means writing one
// adapter, nothing else.

/** Operating mode, normalized from whatever the robot stack reports. */
export type Mode = "idle" | "run" | "pause" | "error" | "other";

/** Kinds of discrete events an adapter may report (beyond state, wait, task, alarm). */
export type AdapterEventKind =
	| "obstacle" // stopped for an obstacle
	| "recovery" // a recovery behavior started or succeeded
	| "recovery_fail"
	| "zone" // entered/left a zone
	| "pending"; // began/ended waiting on something external

export interface Pose {
	/** meters, map frame */
	x: number;
	y: number;
	/** radians, CCW from +x */
	theta: number;
}

/**
 * An occupancy grid with ROS nav_msgs/OccupancyGrid semantics: row-major from
 * the bottom-left cell (row 0 = min y), each cell -1 (unknown) or 0–100
 * (occupancy %). Same frame as the poses.
 */
export interface MapGrid {
	/** meters per cell */
	resolution: number;
	/** map frame pose of cell (0, 0)'s outer corner */
	origin: { x: number; y: number; yaw: number };
	width: number;
	height: number;
	data: ArrayLike<number>;
	/**
	 * Identifies the mapping session (e.g. a map id): it changes when the map's
	 * frame is redefined — a new SLAM run or a different map — so recorded
	 * coverage from another frame isn't mixed in. Omit it and the gateway
	 * guesses: a map that shrinks a lot or changes resolution starts a new one.
	 */
	session?: string;
}

export interface Alarm {
	code: number | string;
	level: string;
	text: string;
}

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
	/** A task (goal, mission) finished. */
	task(robot: string, ok: boolean, detail: string): void;
	event(robot: string, kind: AdapterEventKind, detail: string): void;
	/** The full list of currently active alarms ([] = none). */
	alarms(robot: string, active: Alarm[]): void;
	battery(
		robot: string,
		b: { charge: number; charging: boolean; eStop: boolean },
	): void;
	/** A per-robot detail channel (battery, alarms…) came up or went down. */
	link(robot: string, up: boolean): void;
	/**
	 * The fleet's (merged) map, whenever it changes — e.g. as multi-robot SLAM
	 * grows it. The gateway dedupes and throttles, so call it as often as
	 * convenient.
	 */
	map(grid: MapGrid): void;
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
