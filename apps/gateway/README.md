# gateway

Connects the dashboard (`apps/web`) to a robot fleet. One **adapter** package
speaks the robot stack. This core records what the adapter reports (SQLite) and
serves it on one port:

- `ws://…:8787` streams live fleet state (poses, plans, mode).
  A browser that joins late gets the latest of each message first.
- `GET /history?robot=<name>&days=1|7|30` returns KPIs, trends, events and coverage cells.
- `GET /map/map.yaml`, `/map/map.png` serve the site map from `MAP_FILE`.

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
| `MAP_FILE` | the sim's world with `sim` | the site `map.yaml` (map_server, PNG image) |

Adapters read their own settings from the environment. Settings can also go in
a `.env` in the working directory (`apps/gateway/.env` under pnpm; git-ignored), and
variables set in the shell take precedence.
The file isn't run through a shell, so write paths in full: `~` is not expanded.

## Test

```sh
pnpm test        # every package (turbo)
```
