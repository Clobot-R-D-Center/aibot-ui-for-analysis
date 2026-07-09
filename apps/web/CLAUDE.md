# CLAUDE.md

## Design Context

This app has design context for agents doing UI work:

- **[PRODUCT.md](./PRODUCT.md)** — strategic: register (product), users (external
  customers analyzing their AI service robots), purpose (map + robot visualization
  and spatial/quantitative analysis dashboard), brand personality, anti-references,
  and design principles.
- **[DESIGN.md](./DESIGN.md)** — visual: North Star "The Instrument, Not the
  Cockpit". **Chrome = daisyUI** themes `winter` (light, default) + `night` (dark),
  toggled via `data-theme`; use daisyUI tokens/components (`bg-base-100`,
  `text-base-content`, `btn`, `card`, `stat`, `select`, `join`) — don't hand-roll
  chrome. The **domain visualization layer is custom**: themed occupancy map,
  colorblind-safe `--data-*` (Okabe–Ito) ramp, viridis coverage heatmap, amber
  robot marker, `.tnum` tabular numerals. WCAG AA.

**Core principles:** map is the hero · saturated color reserved for data (never chrome) ·
honest (colorblind-safe, never color-only) encodings · tabular figures for numbers ·
motion serves comprehension.

Read both before designing or changing UI. Use `/impeccable <command>` for design work.
