// Program plan — the FULL 16-week "Powerlifting v3.1 — Deadlift-Free Maximal
// Strength" cycle: weekly loading, goals, rules and per-day targets. Source of
// truth: the Powerlifting_Program_v3_1_MaxStrength Google Sheet. Pure data +
// pure functions (no DOM, no app state) so app.js can drive week-aware routine
// targets and the coach engine off it, and the test harness can exercise it
// directly.
//
// Weights in POUNDS. Program weeks run SUNDAY–Saturday (the split starts on
// the Sun heavy-bench day). Loads are the sheet's own pre-rounded numbers;
// derived variation loads round to the nearest 5 lb.

const PROGRAM_PLAN_VERSION = 1;

const PROGRAM_PLAN = {
  name: "Powerlifting v3.1 — Max Strength",
  totalWeeks: 16,
  // Sunday of week 1. Week 7 was the week of Jul 12 2026 (per the sheet's
  // strength-block annotations), which anchors week 1 to May 31 2026.
  defaultStartDate: "2026-05-31",
  oneRm: { bench: 315, squat: 478 },
  goals: {
    bench: { lo: 322.5, hi: 328 },
    squat: { lo: 470, hi: 485 },
  },
  // Test-day attempt plan (week 16): opener / second / third (earned PR).
  attemptPlan: {
    bench: [295, 312.5, 322.5],
    squat: [445, 470, 485],
  },
  // Weekly direct-set targets (guaranteed Sun/Wed/Thu; Fri is bonus only).
  armSets: { biceps: [14, 16], triceps: [12, 14] },
  rules: {
    progression: "Add load only when the top set is at or under the RPE cap. The cap beats the % ladder: if last week's top set exceeded it, repeat that load.",
    autoDrop: "Elbow ache OR Wed pressing RPE +1 over target → skip Fri (wks 1–10) or drop Fri pump work only (wks 11–15, keep 4×3 speed bench).",
    fatigue: "2 sessions in a row over target RPE → pull the week's loads 5%.",
    benchStandard: "Every comp-bench top set is PAUSED (comp command).",
  },
  // One row per week. bench/squat = top sets; bo = back-off sets (bridge/peak).
  weeks: [
    { week: 1,  block: "Hypertrophy", rpeCap: 8,   bench: { sets: 4, reps: 8, pct: 70,   load: 220 }, benchBO: null,                                  squat: { sets: 4, reps: 6, pct: 70,   load: 335 }, squatBO: null,                                  note: "Base volume. Full accessories." },
    { week: 2,  block: "Hypertrophy", rpeCap: 8,   bench: { sets: 4, reps: 7, pct: 72.5, load: 230 }, benchBO: null,                                  squat: { sets: 4, reps: 6, pct: 72,   load: 345 }, squatBO: null,                                  note: "" },
    { week: 3,  block: "Hypertrophy", rpeCap: 8,   bench: { sets: 5, reps: 6, pct: 75,   load: 235 }, benchBO: null,                                  squat: { sets: 4, reps: 6, pct: 74,   load: 355 }, squatBO: null,                                  note: "" },
    { week: 4,  block: "Hypertrophy", rpeCap: 8,   bench: { sets: 5, reps: 6, pct: 77.5, load: 245 }, benchBO: null,                                  squat: { sets: 4, reps: 5, pct: 76,   load: 365 }, squatBO: null,                                  note: "Heaviest hypertrophy week." },
    { week: 5,  block: "Deload",      rpeCap: 6,   bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,                                  squat: { sets: 3, reps: 5, pct: 62,   load: 295 }, squatBO: null,                                  note: "Deload — 50% accessory sets. No PRs." },
    { week: 6,  block: "Strength",    rpeCap: 8.5, bench: { sets: 4, reps: 5, pct: 80,   load: 250 }, benchBO: null,                                  squat: { sets: 4, reps: 4, pct: 80,   load: 380 }, squatBO: null,                                  note: "Ramp-in week post-deload. Arms drop to 14/16 sets." },
    { week: 7,  block: "Strength",    rpeCap: 8.5, bench: { sets: 4, reps: 4, pct: 83.5, load: 265 }, benchBO: null,                                  squat: { sets: 4, reps: 3, pct: 82.5, load: 395 }, squatBO: null,                                  note: "" },
    { week: 8,  block: "Strength",    rpeCap: 8.5, bench: { sets: 4, reps: 3, pct: 86.5, load: 270 }, benchBO: null,                                  squat: { sets: 3, reps: 3, pct: 85,   load: 405 }, squatBO: null,                                  note: "" },
    { week: 9,  block: "Strength",    rpeCap: 8.5, bench: { sets: 3, reps: 2, pct: 90,   load: 285 }, benchBO: null,                                  squat: { sets: 3, reps: 2, pct: 87.5, load: 420 }, squatBO: null,                                  note: "Heaviest pre-peak volume week." },
    { week: 10, block: "Deload",      rpeCap: 6,   bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,                                  squat: { sets: 3, reps: 5, pct: 62,   load: 295 }, squatBO: null,                                  note: "Deload — 50% accessory sets." },
    { week: 11, block: "Bridge",      rpeCap: 8,   bench: { sets: 1, reps: 1, pct: 88,   load: 275 }, benchBO: { sets: 3, reps: 5, pct: 75, load: 235 }, squat: { sets: 1, reps: 2, pct: 86,   load: 410 }, squatBO: { sets: 3, reps: 5, pct: 74, load: 355 }, note: "Single practice starts. Full accessories." },
    { week: 12, block: "Bridge",      rpeCap: 8,   bench: { sets: 1, reps: 1, pct: 90,   load: 285 }, benchBO: { sets: 3, reps: 5, pct: 76, load: 240 }, squat: { sets: 1, reps: 2, pct: 88,   load: 420 }, squatBO: { sets: 3, reps: 5, pct: 75, load: 360 }, note: "" },
    { week: 13, block: "Bridge",      rpeCap: 8.5, bench: { sets: 1, reps: 1, pct: 92,   load: 290 }, benchBO: { sets: 3, reps: 5, pct: 77, load: 245 }, squat: { sets: 1, reps: 1, pct: 90,   load: 430 }, squatBO: { sets: 3, reps: 5, pct: 76, load: 365 }, note: "Top sets exceed wk-9 weights." },
    { week: 14, block: "Peak",        rpeCap: 9,   bench: { sets: 2, reps: 1, pct: 93,   load: 295 }, benchBO: { sets: 2, reps: 3, pct: 80, load: 250 }, squat: { sets: 1, reps: 1, pct: 91.5, load: 435 }, squatBO: { sets: 2, reps: 3, pct: 78, load: 375 }, note: "Volume −50%. Accessories −60%." },
    { week: 15, block: "Peak",        rpeCap: 9,   bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: { sets: 2, reps: 2, pct: 75, load: 235 }, squat: { sets: 1, reps: 1, pct: 93,   load: 445 }, squatBO: { sets: 2, reps: 2, pct: 72, load: 345 }, note: "Volume −70%. Last heavy single = OPENER, ≥4 days before test. Carb up." },
    { week: 16, block: "Test",        rpeCap: 10,  bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: null,                                  squat: { sets: 1, reps: 1, pct: 93,   load: 445 }, squatBO: null,                                  note: "Test week — squat first, then bench (meet order). Load shown = opener." },
  ],
};

// Which weekday (0=Sun..6=Sat) each seeded routine belongs to, and whether the
// day is required for adherence (Fri is bonus wks 1–10, required wks 11–15).
const PLAN_DAYS = [
  { routineId: "seed-sun-heavy-bench",                 dow: 0, label: "Heavy Bench" },
  { routineId: "seed-mon-squat-primary",               dow: 1, label: "Squat Primary" },
  { routineId: "seed-wed-secondary-press-arms",        dow: 3, label: "Secondary Press + Arms" },
  { routineId: "seed-thu-squat-volume-posterior-arms", dow: 4, label: "Squat Volume + Posterior" },
  { routineId: "seed-fri-speed-bench-pump",            dow: 5, label: "Speed Bench + Pump" },
];

function planRound5(x) { return Math.round(x / 5) * 5; }

function planWeekRow(week) {
  const w = Math.max(1, Math.min(PROGRAM_PLAN.totalWeeks, week));
  return PROGRAM_PLAN.weeks[w - 1];
}

// Program week number for a date. 1..16 during the cycle, 0 before the start
// date, >16 after test week. Weeks run Sun–Sat.
function planWeekNumber(startDateIso, nowMs) {
  if (!startDateIso) return null;
  const start = new Date(startDateIso + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  const now = new Date(nowMs == null ? Date.now() : nowMs);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now - start) / 86400000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

// Ms timestamp of the Sunday starting a given program week.
function planWeekStartMs(startDateIso, week) {
  const start = new Date(startDateIso + "T00:00:00");
  return start.getTime() + (week - 1) * 7 * 86400000;
}

// How many required training days this week's split has (for adherence).
// Sun/Mon/Wed/Thu are always required; Fri is required in weeks 11–15.
function planRequiredSessions(week) {
  return week >= 11 && week <= 15 ? 5 : 4;
}

// Adjustments the coach suggested and the user applied:
// { bench: <topSetLoadOverride>, squat: <...>, scale: <e.g. 0.95> }.
// Overrides replace the sheet's top-set load; scale multiplies every derived
// load for the week (the "pull week loads 5%" rule).
function planApplyAdjustment(load, adj, liftKey) {
  let out = load;
  if (adj && typeof adj[liftKey] === "number" && liftKey) out = adj[liftKey];
  if (adj && typeof adj.scale === "number") out = out * adj.scale;
  return planRound5(out);
}

// Variation scheme per block. Offsets are fractions of the DAY'S comp load;
// pcts are fractions of the cycle-input 1RM.
function planBlockKey(block) {
  return block === "Deload" ? "Hypertrophy" : block; // deload uses hyp schemes at deload loads
}

const PLAN_VARIATIONS = {
  larsen:    { Hypertrophy: { sets: 3, reps: 6, off: 0.12 }, Strength: { sets: 3, reps: 4, off: 0.10 }, Bridge: { sets: 2, reps: 4, off: 0.10 }, Peak: null, Test: null },
  pauseMon:  { Hypertrophy: { sets: 3, reps: 3, off: 0.15 }, Strength: { sets: 2, reps: 3, off: 0.12 }, Bridge: { sets: 2, reps: 2, off: 0.10 }, Peak: null, Test: null },
  cgbp:      { Hypertrophy: { sets: 4, reps: 6, pct: 0.72 }, Strength: { sets: 4, reps: 4, pct: 0.78 }, Bridge: { sets: 3, reps: 4, pct: 0.78 }, Peak: { sets: 2, reps: 3, pct: 0.72 }, Test: null },
  incline:   { Hypertrophy: { sets: 3, reps: 7, pct: 0.66 }, Strength: { sets: 3, reps: 5, pct: 0.70 }, Bridge: { sets: 2, reps: 6, pct: 0.65 }, Peak: null, Test: null },
  thuSquat:  { Hypertrophy: { sets: 3, reps: 6, pct: 0.73 }, Strength: { sets: 3, reps: 5, pct: 0.75 }, Bridge: { sets: 3, reps: 5, pct: 0.74 }, Peak: { sets: 1, reps: 3, pct: 0.70, week14Only: true }, Test: null },
};

function planVariationScheme(kind, block) {
  const scheme = PLAN_VARIATIONS[kind][planBlockKey(block)];
  if (!scheme) return null;
  if (block === "Deload") {
    // 50% accessory sets on deload weeks, same rep targets, lighter by design
    // because the comp loads they key off are deload loads.
    return { ...scheme, sets: Math.max(1, Math.ceil(scheme.sets / 2)) };
  }
  return scheme;
}

function planSetsArray(sets, reps, load) {
  return Array.from({ length: sets }, () => ({ weight: load, reps }));
}

// Full per-routine targets for one program week. Returns
// { [seedRoutineId]: { [exerciseId]: { note, sets: [{weight,reps},...] } } }
// covering only the plan-driven barbell lifts — accessories keep their own
// double-progression targets and last-session weights.
function planRoutineTargets(week, adjustments) {
  const row = planWeekRow(week);
  const adj = (adjustments && adjustments[String(week)]) || null;
  const block = row.block;
  const cap = row.rpeCap;
  const capTxt = block === "Test" ? "" : ` · top set RPE ≤ ${cap}`;
  const wkTag = `Wk ${row.week} · ${block}`;

  const benchLoad = planApplyAdjustment(row.bench.load, adj, "bench");
  const squatLoad = planApplyAdjustment(row.squat.load, adj, "squat");
  const scaleOnly = { scale: adj && adj.scale };

  const out = {};

  // --- Sun: comp bench (+ back-offs) and Larsen/Spoto ---
  const benchSets = planSetsArray(row.bench.sets, row.bench.reps, benchLoad);
  let benchNote = `${wkTag}: ${row.bench.sets}×${row.bench.reps} @ ${benchLoad}${capTxt} · PAUSED (comp command)`;
  if (row.benchBO) {
    const boLoad = planApplyAdjustment(row.benchBO.load, scaleOnly, null);
    benchSets.push(...planSetsArray(row.benchBO.sets, row.benchBO.reps, boLoad));
    benchNote += ` · then back-offs ${row.benchBO.sets}×${row.benchBO.reps} @ ${boLoad}`;
  }
  if (block === "Test") benchNote = `${wkTag}: opener ${PROGRAM_PLAN.attemptPlan.bench[0]} → second ${PROGRAM_PLAN.attemptPlan.bench[1]} → third ${PROGRAM_PLAN.attemptPlan.bench[2]} (earned: only if the second moved at ≤ RPE 9). Full rest 5–8 min.`;
  out["seed-sun-heavy-bench"] = { "barbell-bench-press": { note: benchNote, sets: benchSets } };
  const lv = planVariationScheme("larsen", block);
  if (lv) {
    const load = planRound5(benchLoad * (1 - lv.off));
    out["seed-sun-heavy-bench"]["larsen-spoto-press"] = {
      note: `−${Math.round(lv.off * 100)}% of today's comp bench · ${lv.sets}×${lv.reps} @ ${load}`,
      sets: planSetsArray(lv.sets, lv.reps, load),
    };
  }

  // --- Mon: comp squat (+ back-offs) and pause squat ---
  const squatSets = planSetsArray(row.squat.sets, row.squat.reps, squatLoad);
  let squatNote = `${wkTag}: ${row.squat.sets}×${row.squat.reps} @ ${squatLoad}${capTxt} · no grinders`;
  if (row.squatBO) {
    const boLoad = planApplyAdjustment(row.squatBO.load, scaleOnly, null);
    squatSets.push(...planSetsArray(row.squatBO.sets, row.squatBO.reps, boLoad));
    squatNote += ` · then back-offs ${row.squatBO.sets}×${row.squatBO.reps} @ ${boLoad}`;
  }
  if (block === "Test") squatNote = `${wkTag}: opener ${PROGRAM_PLAN.attemptPlan.squat[0]} → second ${PROGRAM_PLAN.attemptPlan.squat[1]} → third ${PROGRAM_PLAN.attemptPlan.squat[2]} (earned: only if the second moved at ≤ RPE 9). Full rest 5–8 min.`;
  out["seed-mon-squat-primary"] = { "squat": { note: squatNote, sets: squatSets } };
  const pv = planVariationScheme("pauseMon", block);
  if (pv) {
    const load = planRound5(squatLoad * (1 - pv.off));
    out["seed-mon-squat-primary"]["pause-squat"] = {
      note: `−${Math.round(pv.off * 100)}% of today's comp squat · ${pv.sets}×${pv.reps} @ ${load}`,
      sets: planSetsArray(pv.sets, pv.reps, load),
    };
  }

  // --- Wed: CGBP + incline (both % of bench 1RM) ---
  const bench1 = PROGRAM_PLAN.oneRm.bench;
  out["seed-wed-secondary-press-arms"] = {};
  const cv = planVariationScheme("cgbp", block);
  if (cv) {
    const load = planApplyAdjustment(bench1 * cv.pct, scaleOnly, null);
    out["seed-wed-secondary-press-arms"]["close-grip-bench-press"] = {
      note: `${wkTag}: ~${Math.round(cv.pct * 100)}% of bench 1RM · ${cv.sets}×${cv.reps} @ ${load}${block === "Peak" ? " · crisp, no grinding" : ""}`,
      sets: planSetsArray(cv.sets, cv.reps, load),
    };
  }
  const iv = planVariationScheme("incline", block);
  if (iv) {
    const load = planApplyAdjustment(bench1 * iv.pct, scaleOnly, null);
    out["seed-wed-secondary-press-arms"]["incline-barbell-bench-press"] = {
      note: `~${Math.round(iv.pct * 100)}% of bench 1RM · ${iv.sets}×${iv.reps} @ ${load}`,
      sets: planSetsArray(iv.sets, iv.reps, load),
    };
  }

  // --- Thu: squat volume (% of squat 1RM) ---
  const squat1 = PROGRAM_PLAN.oneRm.squat;
  out["seed-thu-squat-volume-posterior-arms"] = {};
  const tv = planVariationScheme("thuSquat", block);
  if (tv && !(tv.week14Only && week !== 14)) {
    const load = planApplyAdjustment(squat1 * tv.pct, scaleOnly, null);
    out["seed-thu-squat-volume-posterior-arms"]["pause-squat"] = {
      note: `High-bar or pause · ~${Math.round(tv.pct * 100)}% of squat 1RM · ${tv.sets}×${tv.reps} @ ${load} · RPE ≤ ${block === "Bridge" ? 7.5 : 8}`,
      sets: planSetsArray(tv.sets, tv.reps, load),
    };
  }

  // --- Fri: speed bench (% of bench 1RM) ---
  out["seed-fri-speed-bench-pump"] = {};
  if (block !== "Test") {
    const req = week >= 11 && week <= 15;
    const pct = req ? 0.72 : 0.70;
    const sets = req ? 4 : 6;
    const load = planApplyAdjustment(bench1 * pct, scaleOnly, null);
    out["seed-fri-speed-bench-pump"]["barbell-bench-press"] = {
      note: req
        ? `Speed — ${Math.round(pct * 100)}% (${load}), <1s pause, move fast · ${sets}×3 · REQUIRED wks 11–15${block === "Peak" ? " · pump work optional/dropped" : ""}`
        : `Speed — ${Math.round(pct * 100)}% (${load}), <1s pause, move fast · ${sets}×3 · Bonus day: skip if elbows ache or Wed pressing ran heavy`,
      sets: planSetsArray(sets, 3, load),
    };
  }

  return out;
}

// The plan's target top-set for a lift in a given week (post-adjustment) —
// what the coach compares logged sessions against.
function planTopSetFor(week, liftKey, adjustments) {
  const row = planWeekRow(week);
  const adj = (adjustments && adjustments[String(week)]) || null;
  const src = liftKey === "bench" ? row.bench : row.squat;
  return {
    load: planApplyAdjustment(src.load, adj, liftKey),
    sets: src.sets, reps: src.reps, rpeCap: row.rpeCap, block: row.block,
  };
}
