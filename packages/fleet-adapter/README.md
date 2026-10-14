# @aibot/fleet-adapter

The interface between a robot stack and the fleet gateway (`apps/gateway`).
An adapter knows its robots: transport, topic names, message formats and state
codes. The gateway knows nothing about them. It records and relays what the
adapter reports through a `FleetSink`, so the dashboard works the same for any
robots.

## Writing an adapter

Create a workspace package `packages/adapter-<name>` (`@aibot/adapter-<name>`)
that default-exports a `StartAdapter`:

```ts
import type { StartAdapter } from "@aibot/fleet-adapter";

const start: StartAdapter = (sink, env) => {
	// connect to your robots (read settings from env), then as data arrives:
	sink.state("robot-1", { online: true, mode: "run", label: "MOVING" });
	sink.poses([{ robot: "robot-1", pose: { x: 1, y: 2, theta: 0 } }]);
	return { stop() { /* disconnect */ } };
};
export default start;
```

Then add it to `apps/gateway/package.json` (`"@aibot/adapter-<name>": "workspace:*"`)
and run the gateway with `FLEET_ADAPTER=<name>`.

- `mode` is normalized to `idle | run | pause | error | other`. `label` is your
  stack's own state name, shown in events.
- Report `state` periodically or on change, since repeats are deduped. Report `poses`
  at your natural rate (~10 Hz is plenty).
- The map is not an adapter's job: the gateway reads it from a file (`MAP_FILE`).
- Call `lost()` when your source disconnects. Robot states are unknown from then
  on, so that time isn't counted as uptime.
- An adapter may pull per-robot detail from a second source (e.g. each robot's
  foxglove_bridge) next to its fleet source; tag `archive/live-map-foxglove`
  holds such a client.

`@aibot/adapter-sim` is a complete reference adapter.
