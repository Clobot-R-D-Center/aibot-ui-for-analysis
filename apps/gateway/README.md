# gateway

Connects the dashboard (`apps/web`) to a robot fleet. One **adapter** package
speaks the robot stack. This core records what the adapter reports (SQLite) and
serves it on one port:

- `ws://…:8787` streams live fleet state (poses, plans, mode, battery, alarms).
  A browser that joins late gets the latest of each message first.
- `GET /history?robot=<name>&days=1|7|30` returns KPIs, trends, events and coverage cells.

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
| `@aibot/foxglove-link` | foxglove_bridge client for ROS 2 adapters |

## Run

```sh
pnpm --filter gateway start        # simulated fleet (FLEET_ADAPTER=sim)
VITE_GATEWAY_URL=ws://localhost:8787 pnpm --filter web dev
```

| env | default | |
|---|---|---|
| `FLEET_ADAPTER` | `sim` | loads `@aibot/adapter-<name>` (must be a dependency here) |
| `WS_PORT` | `8787` | WebSocket + HTTP |
| `HISTORY_DB` | `history.db` | SQLite file |
| `HISTORY_DAYS` | `62` | retention: the 30-day view plus the previous 30 days for deltas |

Adapters read their own settings from the environment.

## Test

```sh
pnpm test        # every package (turbo)
```
