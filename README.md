# aibot-ui-for-analysis

AI 서비스 로봇의 위치, 운행 상태, 이력을 지도 위에서 보고 분석하는 대시보드 모노레포입니다.

- **web** (`apps/web`): 지도 중심의 분석 대시보드입니다. KPI, 추이 차트, 이벤트 로그를 보여줍니다.
- **gateway** (`apps/gateway`): 로봇 함대와 대시보드 사이에서 동작하는 작은 LAN 서비스입니다. 실시간 데이터를 중계하고 이력을 기록합니다.
- **어댑터** (`packages/adapter-*`): 로봇 스택(통신 방식, 토픽, 메시지 형식)마다 하나씩 둡니다. 로봇 스택에 대한 지식은 어댑터 안에만 있습니다.

## 구조

```text
로봇들 ──(로봇 스택의 통신 방식)──▶ 어댑터 ──▶ gateway ──WebSocket(실시간)──▶ 브라우저 (web)
                                              ├── HTTP /history (KPI·추이·이벤트)
                                              ├── HTTP /map      (지도, SLAM으로 갱신)
                                              └── SQLite         (이력 저장)
```

- 브라우저는 **gateway 하나에만** 연결합니다. 로봇이나 로봇 쪽 브로커에 직접 연결하지 않습니다.
- gateway는 어댑터가 보고한 데이터를 기록하고, 하나의 **중립 프로토콜**로 웹에 전달합니다. 그래서 다른 로봇 스택을 붙일 때도 어댑터 하나만 새로 쓰면 되고, 웹과 gateway는 바뀌지 않습니다.
- gateway 없이 웹만 실행하면 내장 데모 데이터로 동작합니다.

## 시작하기

```bash
pnpm install
```

### 1. 데모 모드 (gateway 없이)

```bash
pnpm --filter web dev
```

`http://localhost:3000`에서 데모 지도와 데모 데이터로 열립니다.

### 2. 시뮬레이터로 실시간 모드

로봇 없이 전체 흐름(실시간 위치, 계획 경로, 이력 KPI, SLAM 지도 갱신)을 확인할 수 있습니다.

```bash
pnpm --filter gateway start                                    # 시뮬레이터 어댑터 (기본값)
VITE_GATEWAY_URL=ws://localhost:8787 pnpm --filter web dev     # 다른 터미널에서
```

- 가상 로봇 3대가 운행·대기, 작업 성공·실패, 장애물 정지, 에러·알람, 배터리 변화를 흉내 냅니다. 한 대는 주기적으로 오프라인이 됩니다.
- 지도는 처음에 "모르는 곳"이었다가 로봇이 지나간 주변부터 채워집니다(SLAM 흉내).
- `SIM_REMAP_MS=60000`을 함께 주면 1분마다 지도 작업을 새로 시작합니다. 회차별 이력이 분리되는지 확인할 때 씁니다.

루트의 `pnpm dev`는 웹과 gateway(시뮬레이터)를 함께 띄웁니다. 실시간 모드로 보려면 `VITE_GATEWAY_URL=ws://localhost:8787 pnpm dev`로 실행합니다.

### 3. 실제 로봇에 연결

1. 로봇 스택에 맞는 어댑터를 준비합니다. 없으면 [`packages/fleet-adapter`](packages/fleet-adapter/README.md)의 안내를 따라 새로 만듭니다.
2. gateway를 로봇과 같은 LAN의 PC에서 해당 어댑터로 실행합니다.
   ```bash
   FLEET_ADAPTER=<어댑터 이름> pnpm --filter gateway start
   ```
   로봇이나 브로커의 주소, 포트처럼 어댑터에 필요한 설정은 각 어댑터의 README를 확인하세요.
3. 웹을 gateway 주소로 실행합니다.
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

## 이력과 KPI

gateway는 상태가 바뀐 시점, 이동 기록, 작업 결과, 이벤트를 저장하고, KPI는 조회할 때 계산합니다.

- **KPI:** 커버리지, 이동거리, 가동률, 운행 비율, 작업 성공률, 에러, 대기 시간. 모두 직전 같은 길이 기간과 비교한 증감을 함께 보여줍니다.
- **커버리지:** 로봇이 지나간 칸 수를 지도의 자유 공간 칸 수로 나눈 값입니다. 지도가 있어야 계산할 수 있어서 브라우저에서 계산합니다.
- **지도 작업 회차:** SLAM을 새로 시작하면 지도의 좌표 기준이 바뀌므로, 커버리지와 히트맵은 현재 회차의 기록만 사용합니다. 시간 기반 지표(이동거리, 가동률, 이벤트)는 회차와 상관없이 이어집니다.

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
│   ├── adapter-sim/            # 시뮬레이터 어댑터 (기본값, 참고 구현)
│   └── foxglove-link/          # ROS 2 로봇용 foxglove_bridge 클라이언트 (어댑터에서 사용)
├── package.json                # 공통 스크립트
├── pnpm-workspace.yaml         # 워크스페이스 설정
└── turbo.json                  # 터보레포 파이프라인 설정
```

`apps/web` 내부 주요 위치:

- `src/features/dashboard`: KPI, 차트, 이벤트 로그와 데이터 경계(`demo-data.ts`의 `fetchRobotData`)
- `src/features/map`: 지도 렌더링, 오버레이, 커버리지 계산
- `src/features/live`: gateway 실시간 연결(`use-fleet-live.ts`)과 메시지 해석(`fleet.ts`)
- `src/routes`: 파일 기반 라우트
- `messages`: 다국어 원문 메시지 (`project.inlang`: 국제화 설정)

## 메모

- `pnpm dev` 실행 중에 `build`나 `check-types`를 함께 돌리면 Paraglide 메시지 모듈이 다시 생성되면서 개발 서버가 깨질 수 있습니다. 개발 서버를 멈춘 뒤 실행하세요.
- 이력 DB 구조가 바뀌면 개발 중 만든 `history.db`를 지우고 다시 시작하세요(gateway가 일부는 자동으로 맞춥니다).
