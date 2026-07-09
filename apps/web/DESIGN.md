<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: AI Bot Analysis Dashboard
description: A calm, precise spatial-analytics dashboard for visualizing service robots, their maps, and their behavior.
---

# Design System: AI Bot Analysis Dashboard

## 1. Overview

**Creative North Star: "The Instrument, Not the Cockpit."**

This is a calm scientific instrument for reading a robot's behavior in physical
space — not a bristling control panel. The map is the hero; every pixel of
chrome exists to let the spatial canvas and its data overlays speak. The
personality is *clean, calm, approachable*: dense enough to satisfy an engineer,
legible enough for an operations manager who has never opened it before. The
posture is closest to **Linear** — restrained palette, ruthless hierarchy, quiet
confident motion — applied to a spatial data surface rather than a task list.

Color is scarce on the chrome and abundant on the data. The interface itself is
built from tinted cool neutrals with a single restrained accent; the map's
overlays (paths, heatmaps, zones, events) own the saturated color, and they use
a colorblind-safe vocabulary so meaning never rides on hue alone.

This system explicitly rejects the **generic AI-SaaS** look (cream/parchment
backgrounds, purple gradients, gradient text, hero-metric templates), anything
**toy or gamified** (cartoon mascots, primary-color candy, bubbly chrome), the
**cluttered legacy dashboard** (tiny gray-on-gray widgets with no hierarchy), and
**over-animated flash** (decorative glows and sweeping effects that fight the
data).

**Key Characteristics:**
- Map-first: the spatial canvas dominates, chrome recedes.
- Restrained cool-neutral chrome; a single accent ≤10% of any screen.
- Dual theme: dark canvas is the working default, light for export/print.
- Colorblind-safe data encodings, never color-only.
- Quiet, responsive motion in service of comprehension.

## 2. Colors

A restrained palette: tinted cool neutrals for the interface, one accent used
sparingly, and a separate colorblind-safe data palette reserved for map
overlays and charts. Cool (blue-slate) anchor — calm, instrument-like, and a
neutral backdrop that lets heatmaps and paths read clearly.

### Primary
- **Cool Anchor** `[hue: cool blue-slate; value to be resolved during implementation]`: The single brand accent. Interactive affordances, selected state, focus. Kept to ≤10% of any screen so it stays meaningful against the data color.

### Neutral
- **Canvas (dark)** `[to be resolved during implementation]`: The default working map/background surface. Deep, low-chroma cool neutral so overlays pop.
- **Canvas (light)** `[to be resolved during implementation]`: The export/print surface. Off-white with a faint cool tint (chroma toward the anchor hue, not warm).
- **Surface / Panel** `[to be resolved during implementation]`: Sidebars, cards, toolbars — one step off the canvas via tonal layering.
- **Ink** `[to be resolved during implementation]`: Primary text. Must hit ≥4.5:1 on its surface in both themes.
- **Muted Ink** `[to be resolved during implementation]`: Secondary text and labels — still ≥4.5:1 for body, never light-gray-for-elegance.
- **Border / Divider** `[to be resolved during implementation]`: Hairline structure at 1px.

### Data (reserved; not for chrome)
- **Colorblind-safe categorical + sequential ramps** `[to be resolved during implementation]`: For overlays, series, and heatmaps only. See the Named Rule below.

### Named Rules
**The One Voice Rule.** The brand accent appears on ≤10% of any given screen. Its rarity is what makes it read as "interactive."

**The Data-Owns-Color Rule.** Saturated color belongs to the map overlays and charts, never to decorative chrome. If the chrome is competing with the data for attention, the chrome is wrong.

**The Second-Channel Rule.** Every data encoding pairs color with a second channel — shape, pattern, or label. Meaning must survive on a grayscale print and for a colorblind viewer.

## 3. Typography

**Display / UI Font:** `[single technical/humanist sans — family to be chosen at implementation]` (with system-ui fallback)
**Numeric / Mono Font:** `[a monospace or tabular-figure face — to be chosen at implementation]` (with ui-monospace fallback)

**Character:** One clean sans carries all UI text across weights; a monospaced (or tabular-figures) face carries every metric, coordinate, timestamp, and ID so numbers align in columns and never reflow as values change. Precise and calm, not decorative.

### Hierarchy
- **Display** (`[weight/size to be resolved]`): Rare — view titles, empty-state headlines. Ceiling ~2.5rem; this is a dashboard, not a landing page.
- **Headline** (`[to be resolved]`): Panel and section headings.
- **Title** (`[to be resolved]`): Card headers, toolbar groups.
- **Body** (`[to be resolved]`): Descriptions and prose; cap prose at 65–75ch.
- **Label** (`[to be resolved]`): Control labels, legend entries, table headers.
- **Metric** (mono / tabular figures, `[to be resolved]`): All numeric readouts, coordinates, timestamps.

### Named Rules
**The Tabular-Figures Rule.** Any number that updates in place or sits in a column uses tabular/mono figures. Readouts must not shift horizontally as their value changes.

## 4. Elevation

Flat by default, with tonal layering to separate surfaces (canvas → panel →
popover) rather than heavy drop shadows. Depth is a *response to state* —
shadow appears on hover, active drag, and floating overlays (tooltips,
context menus, dialogs), not at rest. On the dark canvas, elevation reads
through lightness steps first, shadow second.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation appears only in response to state (hover, drag, floating) or for genuinely floating layers.

## 5. Components

<!-- No components exist yet. Re-run /impeccable document once the map canvas, panels, toolbars, and chart primitives are built to capture the real component vocabulary. -->

## 6. Do's and Don'ts

### Do:
- **Do** keep the map canvas as the dominant surface; let chrome recede around it.
- **Do** restrict the brand accent to ≤10% of any screen (The One Voice Rule).
- **Do** reserve saturated color for data overlays and charts, using colorblind-safe palettes.
- **Do** pair every data encoding with a second channel — shape, pattern, or label.
- **Do** use tabular/mono figures for every numeric readout so values don't jump.
- **Do** ship a working dark canvas (default) and a light canvas for export/print, both meeting WCAG AA contrast.
- **Do** keep motion responsive — smooth pan/zoom/scrub and crisp feedback — with a `prefers-reduced-motion` equivalent.

### Don't:
- **Don't** reach for the generic AI-SaaS look: no cream/parchment backgrounds, no purple gradients, no gradient text, no hero-metric templates.
- **Don't** make it toy or gamified: no cartoon robot mascots, no bright primary-color candy palettes, no bubbly rounded chrome.
- **Don't** ship a cluttered legacy dashboard: no tiny gray-on-gray widgets, no wall of panels with no hierarchy.
- **Don't** over-animate: no decorative glows, sweeping effects, or motion that competes with the data.
- **Don't** encode meaning by color alone — it fails for colorblind viewers and grayscale export.
- **Don't** use light-gray body text "for elegance"; body text stays ≥4.5:1 against its surface.
