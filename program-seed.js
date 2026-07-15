// Pre-loaded training program — "Powerlifting v3.1 — Deadlift-Free Maximal Strength".
// Source of truth: Powerlifting_Program_v3_1_MaxStrength (Google Sheet).
// 16 weeks · Test week 16 · Back cleared — RDLs allowed, no conventional deadlifts by choice.
//
// These routines are seeded/updated via seedProgram() in app.js. PROGRAM_SEED_VERSION
// below is bumped whenever this file changes meaningfully; existing installs then get
// their old seed-* routines replaced with these (user-created routines are untouched,
// and workout history/PRs are never modified).
//
// Load rules used to build this (Strength block, WEEK 7 — edit as weeks progress):
//   Bench 1RM 315  ·  Squat 1RM 478
//   Sun comp bench   wk7: 4×4 @ 83.5% = 265   (wk8: 4×3 @ 270 · wk9: 3×2 @ 285) RPE ≤ 8.5
//   Mon comp squat   wk7: 4×3 @ 82.5% = 395   (wk8: 3×3 @ 405 · wk9: 3×2 @ 420) RPE ≤ 8.5
//   Larsen/Spoto = −10% of the day's comp bench load. Pause squat = −12% of comp squat.
//   CGBP 76–80% bench ≈ 245 · Incline bench 68–72% ≈ 220 · Thu squat 74–76% ≈ 360
//   Speed bench 6×3 @ 70% = 220.
//   Accessories are sets/reps only — weight pre-fills from the last logged session.
// Progression: add load only when the top set is RPE ≤ 8.5 (strength block).
// Auto-drop rule: elbow ache OR Wed pressing RPE +1 over target → skip Fri;
// still flagged next week → cut triceps volume ~20%.
// Week 10 = deload (62% · 50% accessory sets), weeks 11–13 bridge (singles + back-offs),
// weeks 14–15 peak, week 16 test. Full week-by-week loads live in the sheet.
//
// Weight is stored internally in POUNDS (the app converts for kg display).

const PROGRAM_SEED_VERSION = 2;

const PROGRAM_SEED = [
  {
    id: "seed-sun-heavy-bench",
    name: "Sun · Heavy Bench",
    exercises: [
      { exerciseId: "barbell-bench-press", note: "Strength wk7: 4×4 @ 265 · wk8: 4×3 @ 270 · wk9: 3×2 @ 285 · top set RPE ≤ 8.5",
        sets: [ {weight:265,reps:4}, {weight:265,reps:4}, {weight:265,reps:4}, {weight:265,reps:4} ] },
      { exerciseId: "larsen-spoto-press", note: "−10% of today's comp bench · 3×4",
        sets: [ {weight:240,reps:4}, {weight:240,reps:4}, {weight:240,reps:4} ] },
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
      { exerciseId: "squat", note: "Strength wk7: 4×3 @ 395 · wk8: 3×3 @ 405 · wk9: 3×2 @ 420 · top set RPE ≤ 8.5, no grinders",
        sets: [ {weight:395,reps:3}, {weight:395,reps:3}, {weight:395,reps:3}, {weight:395,reps:3} ] },
      { exerciseId: "pause-squat", note: "−12% of today's comp squat · 2×3",
        sets: [ {weight:350,reps:3}, {weight:350,reps:3} ] },
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
      { exerciseId: "close-grip-bench-press", note: "76–80% of bench 1RM (240–250) · 4×4",
        sets: [ {weight:245,reps:4}, {weight:245,reps:4}, {weight:245,reps:4}, {weight:245,reps:4} ] },
      { exerciseId: "incline-barbell-bench-press", note: "68–72% of bench 1RM (215–225) · 3×5",
        sets: [ {weight:220,reps:5}, {weight:220,reps:5}, {weight:220,reps:5} ] },
      { exerciseId: "incline-dumbbell-curl", note: "Stretch — 2s eccentric, full stretch · 3×8–10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "hammer-curl", note: "3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "overhead-triceps-extension", note: "3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
    ],
  },
  {
    id: "seed-thu-squat-volume-posterior-arms",
    name: "Thu · Squat Volume + Posterior + Arms",
    exercises: [
      { exerciseId: "pause-squat", note: "High-bar or pause · 74–76% (355–365) · 3×5 · RPE ≤ 8",
        sets: [ {weight:360,reps:5}, {weight:360,reps:5}, {weight:360,reps:5} ] },
      { exerciseId: "romanian-deadlift", note: "Hinge — RPE ≤ 7 · 3×6",
        sets: [ {weight:"",reps:6}, {weight:"",reps:6}, {weight:"",reps:6} ] },
      { exerciseId: "leg-curl", note: "3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "preacher-curl", note: "Or spider curl · 3×10",
        sets: [ {weight:"",reps:10}, {weight:"",reps:10}, {weight:"",reps:10} ] },
      { exerciseId: "reverse-curl", note: "Reverse EZ curl — brachialis/forearm · 2×12",
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
      { exerciseId: "ez-bar-curl", note: "21s — 7 bottom-half + 7 top-half + 7 full · 2 sets",
        sets: [ {weight:"",reps:21}, {weight:"",reps:21} ] },
      { exerciseId: "rope-pushdown", note: "2×12",
        sets: [ {weight:"",reps:12}, {weight:"",reps:12} ] },
    ],
  },
];
