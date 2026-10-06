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
	sink.task("robot-1", true, "arrived at goal");
	return { stop() { /* disconnect */ } };
};
export default start;
```

Then add it to `apps/gateway/package.json` (`"@aibot/adapter-<name>": "workspace:*"`)
and run the gateway with `FLEET_ADAPTER=<name>`.

- `mode` is normalized to `idle | run | pause | error | other`. `label` is your
  stack's own state name, shown in events.
- Report `state` periodically or on change, since repeats are deduped. Report `poses`
  at your natural rate (~10 Hz is plenty). Report `alarms` as the full active
  list, and the gateway records only newly raised ones.
- Report the map with `map()` whenever it changes; the gateway dedupes and
  throttles. If you know when a new mapping run (a new map frame) starts,
  set `session` (e.g. a map id); otherwise the gateway guesses from the map
  shrinking a lot. Coverage is kept per session.
- Call `lost()` when your source disconnects. Robot states are unknown from then
  on, so that time isn't counted as uptime.
- ROS 2 robots running
  [foxglove_bridge](https://github.com/foxglove/ros-foxglove-bridge)?
  `@aibot/foxglove-link` subscribes to the topics you list per robot and decodes
  their CDR messages.

`@aibot/adapter-sim` is a complete reference adapter.
