# aibot-ui-for-analysis

AI Bot UI를 위한 프론트엔드 모노레포입니다.

현재는 `apps/web`를 중심으로 개발하며, React/Vite 기반 웹 앱에 라우팅, 스타일링, 국제화 설정이 포함되어 있습니다.

## 기술 스택

- `pnpm workspace`
- `Turborepo`
- `React 19`
- `Vite`
- `TanStack Router`
- `Tailwind CSS 4` + `daisyUI 5`
- `Biome`
- `Vitest`
- `Paraglide JS` (`inlang` 기반 국제화)

## 시작하기

```bash
pnpm install
pnpm dev
```

개발 서버 기본 주소는 `http://localhost:3000` 입니다.

## 주요 명령어

루트에서 실행:

```bash
pnpm dev
pnpm build
pnpm format-and-lint
pnpm format-and-lint:fix
```

웹 앱만 대상으로 실행:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test
pnpm --filter web check
```

## 프로젝트 구조

```text
.
├── apps/
│   └── web/                # 메인 웹 애플리케이션
├── package.json            # 공통 스크립트
├── pnpm-workspace.yaml     # 워크스페이스 설정
└── turbo.json              # 터보레포 파이프라인 설정
```

`apps/web` 내부 주요 위치:

- `src/routes`: 파일 기반 라우트
- `src/styles.css`: Tailwind CSS + daisyUI 진입점
- `messages`: 다국어 원문 메시지
- `project.inlang`: 국제화 프로젝트 설정

## 메모

- 루트 `pnpm dev`는 Turborepo를 통해 앱 개발 서버를 실행합니다.
- 현재 저장소는 AI Bot 웹 UI의 기본 골격과 개발 도구 구성이 중심입니다.
