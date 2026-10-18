---
name: AI Bot Analysis Dashboard
description: A calm, precise spatial-analytics dashboard for visualizing service robots, their maps, and their behavior.
colors:
  # Chrome comes from daisyUI themes (winter/night) — not hand-authored here.
  # These are the project's OWN tokens: the domain visualization layer.
  data-1-vermilion: "oklch(0.7 0.14 42)"
  data-2-sky: "oklch(0.72 0.13 200)"
  data-3-green: "oklch(0.78 0.15 150)"
  data-4-yellow: "oklch(0.82 0.16 95)"
  data-5-purple: "oklch(0.62 0.18 320)"
  data-6-red-orange: "oklch(0.68 0.13 25)"
  robot-light: "oklch(0.66 0.17 55)"
  robot-dark: "oklch(0.78 0.16 62)"
  map-wall-light: "oklch(0.45 0.02 255)"
  map-wall-dark: "oklch(0.74 0.03 255)"
typography:
  ui:
    fontFamily: "system-ui, sans-serif (Tailwind default)"
    fontSize: "0.875rem base"
  metric:
    fontFamily: "ui-monospace, Roboto Mono, Noto Sans Mono CJK KR, monospace"
    fontFeature: "tabular-nums"
---

# Design System: AI Bot Analysis Dashboard

## 1. Overview

**Creative North Star: "The Instrument, Not the Cockpit."**

A calm instrument for reading a robot's behavior in physical space. The **map is
the hero**; the surrounding chrome recedes so the spatial canvas and its data
overlays speak. Personality: *clean, calm, approachable* — dense enough for an
engineer, legible for an operations manager.

**The chrome is deliberately generic.** It is daisyUI's **winter** (light,
default) and **night** (dark) themes — a neutral, well-maintained base — because
the chrome is not where this product's identity lives. Identity lives in the
**domain visualization layer**, which is hand-built and the real design work:
the themed occupancy map, the colorblind-safe data palette, the viridis coverage
heatmap, the to-scale robot marker, and tabular numeric readouts. Color is
scarce on the chrome and carries meaning only on the data.

This system rejects: **generic AI-SaaS** decoration (gradient text, hero-metric
templates), **toy/gamified** looks (mascots, candy palettes), the **cluttered
legacy dashboard** (gray-on-gray, no hierarchy), and **over-animated flash**.

**Key Characteristics:**
- Map-first: the spatial canvas dominates; chrome (daisyUI) recedes.
- Chrome = daisyUI winter (light default) + night (dark), toggled via `data-theme`.
- Saturated color is reserved for data (overlays, charts), never chrome.
- Colorblind-safe data encodings, never color-only.
- Quiet, comprehension-serving motion; `frameloop="demand"` on the map (idle when static).

## 2. Colors

Chrome colors are **daisyUI theme tokens** — reference them as `base-100`,
`base-200`, `base-300`, `base-content`, and `primary` (Tailwind utilities:
`bg-base-100`, `text-base-content`, `text-primary`, …). Do not hand-pick chrome
colors; use the daisyUI token that matches the role. The project's own tokens
below are the **data layer only**.

### Primary (chrome)
- **daisyUI `primary`**: interactive affordances, active/selected state, focus. Winter → a cool blue; night → a bright cyan. Used sparingly.

### Neutral (chrome)
- **`base-100` / `base-200` / `base-300`**: surface / app background / borders, from the active daisyUI theme. `base-content` is the ink; use `/60` and `/45` opacities for muted and faint text.

### Data (project tokens — reserved, never chrome)
- **`--data-1…6`** (Okabe–Ito, colorblind-safe): categorical series and overlays, assigned in fixed order.
- **`--robot`**: the robot marker — a warm amber, deliberately outside the cool chrome (light/dark variants).
- **`--map-free` / `--map-wall` / `--map-unknown`**: the themed occupancy grid (per theme; unknown is transparent in dark).
- **Viridis ramp**: the coverage heatmap encodes intensity as a perceptually-uniform viridis ramp (not a single-hue glow).

### Named Rules
**The Data-Owns-Color Rule.** Saturated color belongs to map overlays and charts, never to decorative chrome. If the chrome competes with the data, the chrome is wrong.

**The Second-Channel Rule.** Every data encoding pairs color with a second channel — shape, pattern, or label (e.g. the event log's icon+label, hatched "unknown" swatch). Meaning must survive grayscale and CVD.

## 3. Typography

**UI Font:** system sans (Tailwind default `ui-sans-serif, system-ui, …`) — covers EN + KO via the OS.
**Metric Font:** `ui-monospace, "Roboto Mono", "Noto Sans Mono CJK KR", monospace` with `tabular-nums` (the `.tnum` utility).

**Character:** One system sans carries all UI text; a monospaced/tabular face carries every metric, coordinate, timestamp, and ID so numbers align in columns and never reflow as values change.

### Hierarchy
- **Panel/section titles** (daisyUI `card-title`, ~0.875rem medium): card headers, top-bar labels.
- **Stat value** (daisyUI `stat-value`, ~1.5rem semibold, tabular): KPI numbers.
- **Body / label** (~0.875rem / 0.75rem): descriptions, control labels, legend, table headers.
- **Metric** (mono, tabular): coordinate readout, resolution, event times, chart values/axes.

### Named Rules
**The Tabular-Figures Rule.** Any number that updates in place or sits in a column uses `.tnum` (mono, tabular). Readouts never shift horizontally as values change.

## 4. Elevation

Mostly flat: daisyUI **cards** (`card card-border`) with a hairline `base-300`
border and a soft `shadow-sm`. Floating map HUD panels (layers, readout,
controls, error/loading overlays) sit above the canvas with the same soft
shadow. No heavy drop shadows; depth reads through the theme's tonal steps
(base-100 → base-200 → base-300) first, shadow second.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat with a hairline border at rest. Shadow is soft and reserved for cards and genuinely floating layers.

## 5. Components

Chrome uses **daisyUI** components; the map/data layer is **custom** (r3f / SVG).

### daisyUI (chrome)
- **Card** (`card card-border`): every dashboard panel (map, charts, events). The one card level — never nested.
- **Stats** (`stats` + `stat`): the KPI strip — one bordered container with dividers; `stat-value` tabular, `stat-desc` delta in `text-success`/`text-error` + trend icon.
- **Button** (`btn`): `btn-ghost btn-square btn-sm` for icon actions (theme toggle, map zoom/reset); `btn-primary` for the retry CTA.
- **Select** (`select select-sm`): robot selector.

### Custom (map + data — daisyUI does not cover these)
- **Map canvas** (react-three-fiber, orthographic top-down): occupancy grid recolored to the theme (free/wall/unknown), pan/zoom, auto-fit-once (reset button re-frames; never on resize).
- **Robot marker**: disc + heading chevron + halo, to scale, in `--robot`.
- **Overlay layers** (toggleable via the Layers panel): **path** (drei Line, `--data-2`), **route graph** (links and node dots in quiet `--muted`: reference, not data), **zones** (outline + 14 % fill: blocked `--data-6`, slow `--data-4`, other `--data-5`; open polylines dashed; a kind legend shows while on), **coverage heatmap** (viridis DataTexture).
- **Timeline** (sticky at the top of the body; replaces the 1/7/30-day range buttons and the trend charts): fleet distance bars (`--data-2`) and one state band per robot (run `--color-success`, idle 30 % ink, pause `--color-warning`, error `--color-error`, other 15 % ink; offline is a gap), with a state legend so color is never the only cue. Wheel zooms (10 min – 62 days), drag pans, Shift+drag selects the range the KPIs/heatmap/events use, a click sets the moment (a `--robot` line); "back to live" and double-click reset. It is a `role="slider"`: ←/→ move the moment, Esc clears.
- **Event log**: icon + color + label rows (identity never color-alone) with tabular times.
- **Coordinate readout / Layers panel**: floating HUD over the map.

## 6. Do's and Don'ts

### Do:
- **Do** use the daisyUI token/component that matches the role (`bg-base-100`, `text-base-content`, `btn`, `card`, `stat`) — don't hand-roll chrome.
- **Do** keep the map the dominant surface; let chrome recede.
- **Do** reserve saturated color for data (overlays, charts) using the `--data-*` / viridis / robot tokens.
- **Do** pair every data encoding with a second channel (shape/pattern/label).
- **Do** use `.tnum` for every numeric readout.
- **Do** support winter (light, default) + night (dark); both meet WCAG AA.
- **Do** keep map motion demand-driven and `prefers-reduced-motion`-safe.

### Don't:
- **Don't** hand-author chrome colors or reintroduce a parallel token system — the chrome is daisyUI.
- **Don't** reach for generic AI-SaaS decoration (gradient text, hero-metric template) or toy/gamified candy palettes.
- **Don't** ship gray-on-gray clutter with no hierarchy.
- **Don't** over-animate: no decorative glows or motion that competes with the data.
- **Don't** encode meaning by color alone.
- **Don't** show the heatmap as a single-hue glow — intensity is a viridis ramp.
