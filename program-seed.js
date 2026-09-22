// Pre-loaded training program — "Powerbuilding v4.0 — Upper + Quad".
// 16 weeks · starts Mon Sep 21 2026 · 5 days/week · no max test in this cycle.
//
// Replaces "Powerlifting v3.1 — Deadlift-Free Maximal Strength". Alex cancelled the
// Sep 27 max test on 2026-09-21 — he had already maxed in week 12 of that cycle
// (500 squat, 315 paused bench) — and asked for a powerbuilding block instead:
// high-rep work for upper-body and quad size, strength held rather than chased.
//
// HOW STRENGTH IS HELD. Every comp-lift day opens with a heavy "primer" — one top
// set in blocks A/B, three or four in block C — before the volume work. That is the
// documented minimum effective dose for powerlifters (roughly 3–6 weekly sets above
// 80% of 1RM at RPE 7.5–9.5 holds and even adds 1RM). The back-off sets behind it
// are the size dose. Never skip the primer to save time; cut a back-off set instead.
//
// STANDING CONSTRAINTS (unchanged from the injury log):
//   • Lower back ACTIVE — no conventional deadlift, RDL, good morning, bent-over
//     barbell row, or any unsupported loaded hinge. Every row here is chest-supported;
//     the hinge slot is a hip thrust; core is anti-rotation only.
//   • Right shoulder — subacromial pain pattern logged 2026-08-18. Alex asked
//     (2026-09-21) for the plan to be built WITHOUT accommodations; he will modify it
//     himself. Shoulder-friendly variants are listed on the sheet's Swap Options tab.
//
// These routines are the SHAPE of each session. The numbers below are only a
// first-launch placeholder: syncSeedRoutinesToPlan() in app.js rewrites every
// set/rep/load from program-plan.js on each launch, so main lifts track the weekly
// loading table and accessories follow the block tier (A/B/C/D). Accessory LOADS are
// never overwritten — they carry over from the last logged session so double
// progression keeps working.
//
// Baseline shown = WEEK 1, tier A · Bench 1RM 315 · Squat 1RM 500.
// Weight is stored internally in POUNDS (the app converts for kg display).

const PROGRAM_SEED_VERSION = 4;

const PROGRAM_SEED = [
  {
    id: "seed-sun-upper-power",
    name: "Upper Power — Chest + Back",
    exercises: [
      { exerciseId: "barbell-bench-press", note: "Wk 1 · Hypertrophy: PRIMER 1x3 @ 260 · RPE <= 8 · PAUSED (comp command) · then back-offs 4x8 @ 215 · last set 1-2 RIR",
        sets: [ {weight:260,reps:3}, {weight:215,reps:8}, {weight:215,reps:8}, {weight:215,reps:8}, {weight:215,reps:8} ] },
      { exerciseId: "incline-dumbbell-press", note: "Chest - deep stretch, 2s eccentric · 3x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "chest-supported-row", note: "Back - chest stays on the pad (back-safe row) · 4x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "cable-crossover", note: "Chest - lengthened, let the arms travel behind the torso · 3x12–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "triceps-pushdown", note: "Triceps · 3x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "face-pull", note: "Rear delt / shoulder health · 3x15–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
    ],
  },
  {
    id: "seed-mon-lower-power",
    name: "Lower Power — Squat + Quads",
    exercises: [
      { exerciseId: "squat", note: "Wk 1 · Hypertrophy: PRIMER 1x3 @ 400 · RPE <= 8 · comp stance and depth · then back-offs 4x8 @ 325 · last set 1-2 RIR",
        sets: [ {weight:400,reps:3}, {weight:325,reps:8}, {weight:325,reps:8}, {weight:325,reps:8}, {weight:325,reps:8} ] },
      { exerciseId: "leg-press", note: "Quads - feet low and narrow, knees travel, deep as the back allows · 2x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "seated-leg-curl", note: "Hamstrings - seated beats lying for stretch · 3x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "calf-raise", note: "Calves - 2s pause in the stretch · 3x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "pallof-press", note: "Anti-rotation core - the only core pattern the back allows · 3x12/side",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
    ],
  },
  {
    id: "seed-wed-upper-push",
    name: "Upper Hypertrophy — Push, Delts, Arms",
    exercises: [
      { exerciseId: "close-grip-bench-press", note: "Triceps + bench carryover - load is a % of bench 1RM, see the Load column · 4x6-8 @ 225 (~72% of bench 1RM)",
        sets: [ {weight:225,reps:8}, {weight:225,reps:8}, {weight:225,reps:8}, {weight:225,reps:8} ] },
      { exerciseId: "incline-barbell-bench-press", note: "Upper chest - load is a % of bench 1RM, see the Load column · 3x8-12 @ 185 (~57% of bench 1RM)",
        sets: [ {weight:185,reps:12}, {weight:185,reps:12}, {weight:185,reps:12} ] },
      { exerciseId: "cable-lateral-raise", note: "Side delts - cable = dumbbell for growth, pick what feels better · 4x12–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
      { exerciseId: "overhead-cable-extension", note: "Triceps LONG HEAD - overhead beats pushdowns, this slot is not optional · 4x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "incline-dumbbell-curl", note: "Biceps - stretched position, 2s eccentric · 4x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "reverse-pec-deck", note: "Rear delts · 3x15–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
    ],
  },
  {
    id: "seed-thu-lower-hyp",
    name: "Lower Hypertrophy — Quads + Posterior",
    exercises: [
      { exerciseId: "hack-squat", note: "Quads - machine, minimal spinal load. Heaviest quad work of the week · 3x6–10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "bulgarian-split-squat", note: "Quads unilateral - torso upright, long stride · 3x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "leg-extension", note: "Quads - HIPS EXTENDED (recline the seat back). Hits rectus femoris, which squats and presses barely touch · 3x12–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
      { exerciseId: "hip-thrust", note: "Glutes/hams - RPE <= 7, never a max. Hinge substitute while the back is active · 3x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "leg-curl", note: "Hamstrings · 3x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "seated-calf-raise", note: "Calves - soleus · 3x12–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
    ],
  },
  {
    id: "seed-fri-upper-pull",
    name: "Upper Hypertrophy — Pull, Delts, Arms",
    exercises: [
      { exerciseId: "lat-pulldown", note: "Lats - full stretch at the top, no torso swing · 4x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "seated-cable-row", note: "Mid-back - chest-supported machine row is fine; no bent-over BB row · 4x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "seated-dumbbell-press", note: "Delts - seated with back support (standing axial load is out) · 3x8–12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "cable-lateral-raise", note: "Side delts - second exposure of the week · 4x12–20",
        sets: [ {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20}, {weight:"",reps:20} ] },
      { exerciseId: "preacher-curl", note: "Biceps short-length. Superset with the pushdown · 4x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "hammer-curl", note: "Brachialis/forearm - thickens the arm · 3x10–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "rope-pushdown", note: "Triceps finisher - superset with the preacher curl · 3x12–15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
    ],
  },
];
