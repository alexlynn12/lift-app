# lift-app

Offline-first PWA for logging lifts against a programmed training cycle.

**Current program: Powerbuilding v4.0 — Upper + Quad** (16 weeks, Mon Sep 21 2026 → Sat Jan 9 2027).
Five sessions a week: Sun upper power · Mon lower power · Wed upper hypertrophy (push) ·
Thu lower hypertrophy (quads) · Fri upper hypertrophy (pull). Week 1 is a compressed six-day
start. No max test — week 16 re-expresses the 1RMs with a 95% double capped at RPE 8.

- `program-plan.js` — the source of truth: weekly loading, calendar, accessory tiers, coach targets.
- `program-seed.js` — first-launch routine shapes; `syncSeedRoutinesToPlan()` rewrites them each launch.
- `app.js` — UI, logging, analytics, coach engine.

Companion spreadsheet: `Powerbuilding_Program_v4_0_UpperQuad.xlsx` (loads are formulas off the 1RM inputs).
