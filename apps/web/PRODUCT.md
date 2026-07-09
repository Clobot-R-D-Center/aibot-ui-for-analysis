# Product

## Register

product

## Users

External customers — Clobot's clients analyzing their own AI service robots.
They work at a desk in focused sessions, reviewing how a robot behaves in a
physical space: where it went, what it sensed, where things went well or wrong.
Audience is mixed technical/non-technical, so the UI must read to an operations
manager as well as an engineer. Bilingual: English and Korean (paraglide).

## Product Purpose

A robotics analysis dashboard. Its job is to make a robot's behavior in the
real world legible:

- **Visualize** the map the robot uses (occupancy grid / floor plan) and the
  robot itself on that map.
- **Overlay** analysis data onto the map spatially — paths, heatmaps, events,
  zones — so insight is anchored to *where* it happened.
- **Express** the same and adjacent data as graphs and numeric readouts for
  quantitative comparison.

Success = a customer opens the dashboard and, without a manual, understands
what their robot did and how well it did it — spatially and numerically.

## Brand Personality

Clean, calm, approachable. Confident enough to carry dense spatial and
quantitative data, but never intimidating. Voice is plain and precise: it
explains the data rather than showing off. Feels like a well-made instrument,
not a control panel bristling with dials.

## Anti-references

- **Generic AI-SaaS.** No cream/parchment backgrounds, purple gradients,
  gradient text, or hero-metric templates.
- **Toy / gamified / playful.** No cartoon robot mascots, bright primary-color
  palettes, or bubbly rounded chrome. This is a serious analysis tool.
- **Cluttered legacy dashboard.** No tiny fonts, gray-on-gray, or wall-of-
  widgets with no hierarchy. Density is earned through hierarchy, not cramming.
- **Over-animated / flashy.** No decorative glows, sweeping effects, or motion
  that competes with the data.

## Design Principles

1. **The map is the hero.** Spatial context comes first; chrome and controls
   recede so the canvas dominates. Everything else orbits the map.
2. **Legible to non-engineers.** An operations manager should understand a view
   as fast as an engineer. Explain the data; avoid jargon walls and raw dumps.
3. **Calm under density.** The tool carries a lot of information, but it's paced
   and prioritized. Hierarchy and progressive disclosure over cramming.
4. **Honest encodings.** Data overlays are colorblind-safe and never rely on
   color alone (pair with shape, pattern, or label). Numeric readouts are exact,
   not rounded into vagueness.
5. **Motion serves comprehension.** Transitions clarify how state changed on the
   map (pan, zoom, timeline scrub); nothing animates for decoration.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**, colorblind-safe throughout. Data overlays must combine
color with a second channel (shape/pattern/label) and use a colorblind-safe
categorical/sequential palette. Full keyboard operability and visible focus.
Respect `prefers-reduced-motion` with non-animated equivalents. Bilingual
EN/KO, so layouts must tolerate text-length variance.
