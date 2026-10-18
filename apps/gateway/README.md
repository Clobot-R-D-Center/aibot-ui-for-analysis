# gateway

Connects the dashboard (`apps/web`) to a robot fleet. One **adapter** package
speaks the robot stack. This core records what the adapter reports (SQLite) and
serves it on one port:

- `ws://…:8787` streams live fleet state (poses, plans, mode).
  A browser that joins late gets the latest of each message first.
- `GET /history?robot=<name>&from=<ms>&to=<ms>` returns KPIs with deltas
  against the stretch just before, events and coverage cells.
- `GET /timeline?from=<ms>&to=<ms>&n=96` returns each robot's state bands
  (`[start, end, "off" | mode]`) and the fleet's distance in `n` buckets (km).
- `GET /snapshot?t=<ms>` returns the map session in force at `t` and every
  robot as it was then: state, wait, graph place and pose (interpolated
  between 1 Hz samples while moving; none from another session's frame).
- `GET /map/map.yaml`, `/map/map.png` serve the site map from `MAP_DIR`, and
  `/map/site.json` its graph and zones (see `Site` in `@aibot/fleet-adapter`).

The browser only ever sees this neutral protocol (`LiveMessage` in
`src/main.ts`), so supporting another robot stack means writing one adapter. The
UI doesn't change.

```
robots ──(any transport)──▶ @aibot/adapter-<name> ──FleetSink──▶ gateway ──ws / http──▶ web
                                                                    └── history.db
```

| package | |
|---|---|
| `@aibot/fleet-adapter` | the adapter interface, and how to write one |
| `@aibot/adapter-sim` | simulated fleet: the default and reference adapter |

## Run

```sh
pnpm --filter gateway start        # simulated fleet (FLEET_ADAPTER=sim)
pnpm --filter web dev             # connects to ws://<host>:8787
```

| env | default | |
|---|---|---|
| `FLEET_ADAPTER` | `sim` | loads `@aibot/adapter-<name>` (must be a dependency here) |
| `WS_PORT` | `8787` | WebSocket + HTTP |
| `HISTORY_DB` | `history.db` | SQLite file |
| `HISTORY_DAYS` | `62` | retention: the 30-day view plus the previous 30 days for deltas |
| `MAP_DIR` | the sim's world with `sim` | the site map folder: its `map.yaml` (map_server, PNG image; without `image`, `map.png`), and its meta from the adapter's `loadSite` or a `site.json` there |

Adapters read their own settings from the environment. Settings can also go in
a `.env` in the working directory (`apps/gateway/.env` under pnpm; git-ignored), and
variables set in the shell take precedence.
The file isn't run through a shell, so write paths in full: `~` is not expanded.

## Test

```sh
pnpm test        # every package (turbo)
```
