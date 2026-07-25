// Pre-loaded training program — "Powerlifting v3.1 — Deadlift-Free Maximal Strength".
// Source of truth: Powerlifting_Program_v3_1_MaxStrength, vacation-adjusted build (2026-07-25).
// 16 weeks · Test week 16 = Sun Sep 20 2026 · Back cleared — RDLs allowed, no conventional
// deadlifts by choice.
//
// These routines are the SHAPE of each session — the full exercise list off the sheet's
// "Daily Templates" tab. The numbers below are only a starting point: syncSeedRoutinesToPlan()
// in app.js rewrites every set/rep/load from program-plan.js on each launch, so main lifts
// track the weekly loading table and accessories follow the block (hypertrophy / strength /
// bridge / peak / deload). Accessory LOADS are never overwritten — they carry over from the
// last logged session so double progression keeps working.
//
// PROGRAM_SEED_VERSION is bumped whenever this file changes meaningfully; existing installs
// then get their old seed-* routines replaced with these (user-created routines are untouched,
// and workout history/PRs are never modified).
//
// v3 changes: added the Wednesday pulling slot (lat pulldown) the 2026-07-15 audit called for —
// weekly pulling was 7 sets, all on Sunday. Baseline numbers moved to week 9 (Strength).
//
// Baseline shown = WEEK 9, Strength block · Bench 1RM 315 · Squat 1RM 478
//   Sun comp bench   3×2 @ 90%   = 285   (PAUSED, comp command)  RPE ≤ 8.5
//   Mon comp squat   3×2 @ 87.5% = 420                           RPE ≤ 8.5
//   Larsen/Spoto = −10% of the day's comp bench. Pause squat = −12% of comp squat.
//   CGBP 78% bench ≈ 245 · Incline 70% ≈ 220 · Thu squat 75% ≈ 360 · Speed bench 70% = 220
// Progression: add load only when the top set is at or under the RPE cap — the cap beats the
// % ladder. Auto-drop: elbow ache OR Wed pressing RPE +1 over target → skip Fri (wks 1–10) or
// drop Fri pump work only (wks 11–15); flagged again → cut triceps volume ~20%.
//
// Weight is stored internally in POUNDS (the app converts for kg display).

const PROGRAM_SEED_VERSION = 3;

const PROGRAM_SEED = [
  {
    id: "seed-sun-heavy-bench",
    name: "Sun · Heavy Bench",
    exercises: [
      { exerciseId: "barbell-bench-press", note: "Wk 9 · Strength: 3×2 @ 285 · top set RPE ≤ 8.5 · PAUSED (comp command)",
        sets: [ {weight:285,reps:2}, {weight:285,reps:2}, {weight:285,reps:2} ] },
      { exerciseId: "larsen-spoto-press", note: "−10% of today's comp bench · 3×4 @ 255",
        sets: [ {weight:255,reps:4}, {weight:255,reps:4}, {weight:255,reps:4} ] },
      { exerciseId: "chest-supported-row", note: "Upper back · 4×6–8",
        sets: [ {weight:"",reps:8}, {weight:"",reps:8}, {weight:"",reps:8}, {weight:"",reps:8} ] },
      { exerciseId: "cable-curl", note: "Behind-body (stretch position) · 2×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "face-pull", note: "Shoulder health · 3×15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "triceps-pushdown", note: "3×8–10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
    ],
  },
  {
    id: "seed-mon-squat-primary",
    name: "Mon · Squat Primary",
    exercises: [
      { exerciseId: "squat", note: "Wk 9 · Strength: 3×2 @ 420 · top set RPE ≤ 8.5 · no grinders",
        sets: [ {weight:420,reps:2}, {weight:420,reps:2}, {weight:420,reps:2} ] },
      { exerciseId: "pause-squat", note: "−12% of today's comp squat · 2×3 @ 370",
        sets: [ {weight:370,reps:3}, {weight:370,reps:3} ] },
      { exerciseId: "leg-press", note: "2×8",
        sets: [ {weight:"",reps:8}, {weight:"",reps:8} ] },
      { exerciseId: "ab-wheel-rollout", note: "Anti-flexion core (or Pallof press) · 3 sets",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
    ],
  },
  {
    id: "seed-wed-secondary-press-arms",
    name: "Wed · Secondary Press + Arms",
    exercises: [
      { exerciseId: "close-grip-bench-press", note: "~78% of bench 1RM · 4×4 @ 245",
        sets: [ {weight:245,reps:4}, {weight:245,reps:4}, {weight:245,reps:4}, {weight:245,reps:4} ] },
      { exerciseId: "incline-barbell-bench-press", note: "~70% of bench 1RM · 3×5 @ 220",
        sets: [ {weight:220,reps:5}, {weight:220,reps:5}, {weight:220,reps:5} ] },
      { exerciseId: "lat-pulldown", note: "Weekly pulling (or chest-supported row) · 3×8",
        sets: [ {weight:"",reps:8}, {weight:"",reps:8}, {weight:"",reps:8} ] },
      { exerciseId: "incline-dumbbell-curl", note: "Stretch — 2s eccentric, full stretch · 3×8–10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "hammer-curl", note: "3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "overhead-triceps-extension", note: "Long head · 3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
    ],
  },
  {
    id: "seed-thu-squat-volume-posterior-arms",
    name: "Thu · Squat Volume + Posterior + Arms",
    exercises: [
      { exerciseId: "pause-squat", note: "High-bar or pause · ~75% of squat 1RM · 3×5 @ 360 · RPE ≤ 8",
        sets: [ {weight:360,reps:5}, {weight:360,reps:5}, {weight:360,reps:5} ] },
      { exerciseId: "romanian-deadlift", note: "Hinge — RPE ≤ 7, never a max · 3×6",
        sets: [ {weight:"",reps:6}, {weight:"",reps:6}, {weight:"",reps:6} ] },
      { exerciseId: "leg-curl", note: "3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "preacher-curl", note: "Or spider curl — short-length/peak · 3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "reverse-curl", note: "Reverse EZ — brachialis/forearm · 2×12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12} ] },
      { exerciseId: "skull-crusher", note: "Or pushdown · 3×8–10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
    ],
  },
  {
    id: "seed-fri-speed-bench-pump",
    name: "Fri · Speed Bench + Pump (bonus)",
    exercises: [
      { exerciseId: "barbell-bench-press", note: "Speed — 70% (220), <1s pause, move fast · 6×3 · Bonus day: skip if elbows ache or Wed pressing ran heavy",
        sets: [ {weight:220,reps:3}, {weight:220,reps:3}, {weight:220,reps:3}, {weight:220,reps:3}, {weight:220,reps:3}, {weight:220,reps:3} ] },
      { exerciseId: "push-up", note: "Or band flye · 2×15",
        sets: [ {weight:"",reps:15}, {weight:"",reps:15} ] },
      { exerciseId: "ez-bar-curl", note: "21s — 7 bottom-half + 7 top-half + 7 full · 2 rounds",
        sets: [ {weight:"",reps:21}, {weight:"",reps:21} ] },
      { exerciseId: "rope-pushdown", note: "2×12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12} ] },
    ],
  },
];
