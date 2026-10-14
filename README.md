# aibot-ui-for-analysis

AI 서비스 로봇의 위치, 운행 상태, 이력을 지도 위에서 보고 분석하는 대시보드 모노레포입니다.

- **web** (`apps/web`): 지도 중심의 분석 대시보드입니다. KPI, 추이 차트, 이벤트 로그를 보여줍니다.
- **gateway** (`apps/gateway`): 로봇 함대와 대시보드 사이에서 동작하는 작은 LAN 서비스입니다. 실시간 데이터를 중계하고 이력을 기록합니다.
- **어댑터** (`packages/adapter-*`): 로봇 스택(통신 방식, 토픽, 메시지 형식)마다 하나씩 둡니다. 로봇 스택에 대한 지식은 어댑터 안에만 있습니다.

## 구조

```text
로봇들 ──(로봇 스택의 통신 방식)──▶ 어댑터 ──▶ gateway ──WebSocket(실시간)──▶ 브라우저 (web)
                                              ├── HTTP /history (KPI·추이·이벤트)
                                              ├── HTTP /map      (지도 파일)
                                              └── SQLite         (이력 저장)
```

- 브라우저는 **gateway 하나에만** 연결합니다. 로봇이나 로봇 쪽 브로커에 직접 연결하지 않습니다.
- gateway는 어댑터가 보고한 데이터를 기록하고, 하나의 **중립 프로토콜**로 웹에 전달합니다. 그래서 다른 로봇 스택을 붙일 때도 어댑터 하나만 새로 쓰면 되고, 웹과 gateway는 바뀌지 않습니다.
- 웹은 항상 gateway에 연결합니다. 로봇이 없을 때는 gateway의 **시뮬레이터 어댑터**가 가상 로봇을 만들어 줍니다.

## 시작하기

```bash
pnpm install
```

### 1. 시뮬레이터로 실행 (로봇 없이)

```bash
pnpm dev
```

웹(`http://localhost:3000`)과 gateway(시뮬레이터)가 함께 뜹니다. 로봇 없이 전체 흐름(실시간 위치, 계획 경로, 이력 KPI, 지도)을 확인할 수 있습니다.

- 가상 로봇 3대가 운행·대기, 장애물 정지, 에러를 흉내 냅니다. 한 대는 주기적으로 오프라인이 됩니다.
- 지도는 시뮬레이터 월드의 지도 파일(`packages/adapter-sim/map/map.yaml`)입니다. `MAP_FILE`을 주지 않으면 이 파일을 씁니다.

웹은 기본으로 자신이 열린 호스트의 8787 포트(`ws://<호스트>:8787`)에서 gateway를 찾습니다. gateway가 다른 PC에 있으면 `VITE_GATEWAY_URL`로 지정합니다.

### 2. 실제 로봇에 연결

1. 로봇 스택에 맞는 어댑터를 준비합니다. 없으면 [`packages/fleet-adapter`](packages/fleet-adapter/README.md)의 안내를 따라 새로 만듭니다.
2. gateway를 로봇과 같은 LAN의 PC에서 해당 어댑터로 실행합니다.
   ```bash
   FLEET_ADAPTER=<어댑터 이름> pnpm --filter gateway start
   ```
   로봇이나 브로커의 주소, 포트처럼 어댑터에 필요한 설정은 각 어댑터의 README를 확인하세요.
3. 웹을 실행합니다. gateway가 같은 PC에 있으면 그냥 `pnpm --filter web dev`, 다른 PC에 있으면 주소를 지정합니다.
   ```bash
   VITE_GATEWAY_URL=ws://<gateway PC 주소>:8787 pnpm --filter web dev
   ```

#### 네트워크

| 연결 | 기본 포트 | 비고 |
|---|---|---|
| 브라우저 → web | 3000 | 개발 서버 |
| 브라우저 → gateway | 8787 | WebSocket + HTTP (`WS_PORT`) |
| gateway → 로봇 | 어댑터마다 다름 | 각 어댑터 README 참고 |

#### gateway 설정

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `FLEET_ADAPTER` | `sim` | 불러올 어댑터 (`@aibot/adapter-<이름>`) |
| `WS_PORT` | `8787` | WebSocket과 HTTP 포트 |
| `HISTORY_DB` | `history.db` | 이력 SQLite 파일 |
| `HISTORY_DAYS` | `62` | 이력 보관 기간(일). 30일 화면과 직전 30일 비교를 위해 62일 |
| `MAP_FILE` | (없음) | 현장 지도 파일(map_server 형식 `map.yaml` + PNG). 지도는 이 파일에서만 옵니다. 시뮬레이터는 기본으로 자기 월드 지도를 씁니다 |
| `COVER_RADIUS` | `0.35` | 커버리지 계산에 쓰는 로봇 반경(m). 로봇이 지나가며 쓸고 간 폭의 절반입니다 |

## 이력과 KPI

gateway는 상태가 바뀐 시점, 대기, 이동 기록을 저장하고, KPI는 조회할 때 계산합니다.

- **KPI:** 커버리지, 이동거리, 가동률, 운행 비율, 에러, 대기 시간. 모두 직전 같은 길이 기간과 비교한 증감을 함께 보여줍니다.
- **커버리지:** 로봇이 지나간 칸 수를 지도의 자유 공간 칸 수로 나눈 값입니다. 지도가 있어야 계산할 수 있어서 브라우저에서 계산합니다.
- **지도 회차:** 지도 파일이 바뀌면 좌표 기준도 바뀔 수 있으므로, 커버리지와 히트맵은 현재 지도 파일의 기록만 사용합니다. 시간 기반 지표(이동거리, 가동률, 이벤트)는 회차와 상관없이 이어집니다.

## 기술 스택

- `pnpm workspace` + `Turborepo`
- web: `React 19`, `Vite`, `TanStack Router`, `three.js` (`@react-three/fiber`), `Tailwind CSS 4` + `daisyUI 5`, `Paraglide JS` (국제화)
- gateway: `Node.js 24` (TypeScript를 빌드 없이 실행), `node:sqlite`, `ws`
- 도구: `Biome`, `Vitest`, `node --test`

## 주요 명령어

루트에서 실행:

```bash
pnpm dev                  # 웹 + gateway(시뮬레이터)
pnpm test                 # 모든 패키지 테스트
pnpm build
pnpm format-and-lint
pnpm format-and-lint:fix
```

패키지별:

```bash
pnpm --filter web dev
pnpm --filter web test
pnpm --filter gateway start
pnpm --filter gateway test
```

## 프로젝트 구조

```text
.
├── apps/
│   ├── web/                    # 대시보드 웹 앱
│   └── gateway/                # 로봇 함대 ↔ 대시보드 중계, 이력 저장
├── packages/
│   ├── fleet-adapter/          # 어댑터 인터페이스와 작성 안내
│   └── adapter-sim/            # 시뮬레이터 어댑터 (기본값, 참고 구현)
├── package.json                # 공통 스크립트
├── pnpm-workspace.yaml         # 워크스페이스 설정
└── turbo.json                  # 터보레포 파이프라인 설정
```

`apps/web` 내부 주요 위치:

- `src/features/dashboard`: KPI, 차트, 이벤트 로그와 이력 데이터(`robot-data.ts`의 `fetchRobotData`)
- `src/features/map`: 지도 렌더링, 오버레이, 커버리지 계산
- `src/features/live`: gateway 실시간 연결(`use-fleet-live.ts`)과 메시지 해석(`fleet.ts`)
- `src/routes`: 파일 기반 라우트
- `messages`: 다국어 원문 메시지 (`project.inlang`: 국제화 설정)

## 메모

- `pnpm dev` 실행 중에 `build`나 `check-types`를 함께 돌리면 Paraglide 메시지 모듈이 다시 생성되면서 개발 서버가 깨질 수 있습니다. 개발 서버를 멈춘 뒤 실행하세요.
- 이력 DB 구조가 바뀌면 개발 중 만든 `history.db`를 지우고 다시 시작하세요(gateway가 일부는 자동으로 맞춥니다).
