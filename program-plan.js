// Program plan — the FULL 16-week "Powerlifting v3.1 — Deadlift-Free Maximal
// Strength" cycle: weekly loading, goals, rules, the training CALENDAR, and
// per-day targets. Source of truth: the Powerlifting_Program_v3_1_MaxStrength
// sheet, VACATION-ADJUSTED build (2026-07-25). Pure data + pure functions (no
// DOM, no app state) so app.js can drive day-aware routine targets and the
// coach engine off it, and the test harness can exercise it directly.
//
// Weights in POUNDS. Loads are the sheet's own pre-rounded numbers; derived
// variation loads round to the nearest 5 lb.
//
// CALENDAR NOTE (v2): weeks are no longer fixed Sun–Sat 7-day blocks. The
// Aug 6–14 trip absorbs the week-10 deload, so the calendar stretches: week 9
// opens on SATURDAY Jul 25 (heavy bench moved to the fresh day), week 10 runs
// 15 days (3 light sessions, then the trip), and training resumes MONDAY
// Aug 17. Every load and the block order are unchanged — only the calendar
// moves. Test day shifts Sun Sep 13 → Sun Sep 20.

const PROGRAM_PLAN_VERSION = 2;

const PROGRAM_PLAN = {
  name: "Powerlifting v3.1 — Max Strength",
  totalWeeks: 16,
  // Sunday of week 1. Week 9 opens Sat Jul 25 2026 per the vacation-adjusted
  // sheet, which anchors week 1 to May 31 2026.
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
    vacation: "The Aug 6–14 trip REPLACES the week-10 gym deload — don't do both. Three light sessions (Aug 2/3/5), then the trip is the rest.",
    reentry: "Week 11 is a re-entry week after ~11 days off: cap ALL top sets at RPE 7.5 and lighten or skip the heavy single until bar speed is normal. Roll into week-12 loads only if the singles felt right; otherwise repeat week 11.",
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
    { week: 9,  block: "Strength",    rpeCap: 8.5, bench: { sets: 3, reps: 2, pct: 90,   load: 285 }, benchBO: null,                                  squat: { sets: 3, reps: 2, pct: 87.5, load: 420 }, squatBO: null,                                  note: "Heaviest pre-peak volume week. Vacation-adjusted: heavy bench Sat Jul 25 (fresh day), squat primary Sun Jul 26, Mon Jul 27 off for the event. Nothing is lost — both comp lifts are banked over the weekend." },
    { week: 10, block: "Deload",      rpeCap: 6,   bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,                                  squat: { sets: 3, reps: 5, pct: 62,   load: 295 }, squatBO: null,                                  note: "Deload = your vacation. Three light sessions (Aug 2/3/5) at 50% accessory sets, then off Aug 6–16. Don't do a gym deload AND 11 days off — the trip is the rest." },
    { week: 11, block: "Bridge",      rpeCap: 7.5, bench: { sets: 1, reps: 1, pct: 88,   load: 275 }, benchBO: { sets: 3, reps: 5, pct: 75, load: 235 }, squat: { sets: 1, reps: 2, pct: 86,   load: 410 }, squatBO: { sets: 3, reps: 5, pct: 74, load: 355 }, note: "RE-ENTRY week — resume Mon Aug 17 after ~11 days off. Cap every top set at RPE 7.5. Own the back-offs; lighten or skip the heavy single until bar speed returns. Roll into wk-12 loads only if the singles felt normal — otherwise repeat this week." },
    { week: 12, block: "Bridge",      rpeCap: 8,   bench: { sets: 1, reps: 1, pct: 90,   load: 285 }, benchBO: { sets: 3, reps: 5, pct: 76, load: 240 }, squat: { sets: 1, reps: 2, pct: 88,   load: 420 }, squatBO: { sets: 3, reps: 5, pct: 75, load: 360 }, note: "Back to the normal Sun–Fri split. Single practice at full load." },
    { week: 13, block: "Bridge",      rpeCap: 8.5, bench: { sets: 1, reps: 1, pct: 92,   load: 290 }, benchBO: { sets: 3, reps: 5, pct: 77, load: 245 }, squat: { sets: 1, reps: 1, pct: 90,   load: 430 }, squatBO: { sets: 3, reps: 5, pct: 76, load: 365 }, note: "Top sets exceed wk-9 weights. If a single beats plan at RPE ≤ 8, update the 1RM inputs — attempts recalculate." },
    { week: 14, block: "Peak",        rpeCap: 9,   bench: { sets: 2, reps: 1, pct: 93,   load: 295 }, benchBO: { sets: 2, reps: 3, pct: 80, load: 250 }, squat: { sets: 1, reps: 1, pct: 91.5, load: 435 }, squatBO: { sets: 2, reps: 3, pct: 78, load: 375 }, note: "Volume −50%. Accessories −60%. Saturday off." },
    { week: 15, block: "Peak",        rpeCap: 9,   bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: { sets: 2, reps: 2, pct: 75, load: 235 }, squat: { sets: 1, reps: 1, pct: 93,   load: 445 }, squatBO: { sets: 2, reps: 2, pct: 72, load: 345 }, note: "Volume −70%. Openers early in the week (≥4 days before test), then Friday is REST. Carb-load the final 3 days. Sleep is programming." },
    { week: 16, block: "Test",        rpeCap: 10,  bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: null,                                  squat: { sets: 1, reps: 1, pct: 93,   load: 445 }, squatBO: null,                                  note: "TEST — Sun Sep 20. Squat first, then bench (meet order). Full rest 5–8 min between attempts. Third attempts are earned: take the PR only if the second moved at ≤ RPE 9." },
  ],
};

// Which weekday (0=Sun..6=Sat) each seeded routine belongs to in the DEFAULT
// week, and whether the day is required for adherence (Fri is bonus wks 1–10,
// required wks 11–15).
const PLAN_DAYS = [
  { routineId: "seed-sun-heavy-bench",                 dow: 0, label: "Heavy Bench" },
  { routineId: "seed-mon-squat-primary",               dow: 1, label: "Squat Primary" },
  { routineId: "seed-wed-secondary-press-arms",        dow: 3, label: "Secondary Press + Arms" },
  { routineId: "seed-thu-squat-volume-posterior-arms", dow: 4, label: "Squat Volume + Posterior" },
  { routineId: "seed-fri-speed-bench-pump",            dow: 5, label: "Speed Bench + Pump" },
];

// ---------------------------------------------------------------------------
// CALENDAR
// ---------------------------------------------------------------------------
// One entry per program week. `offset` = days from the program start date to
// the first day of that week; `length` = how many days the week occupies.
// Weeks 1–7 are plain Sun–Sat sevens. From week 8 on the vacation shift bites:
// week 8 is trimmed to 6 days so week 9 can open on Saturday Jul 25.
//
// `days` (optional) overrides the default weekday mapping. Each entry:
//   d        offset in days from the START of that week
//   id       seeded routine to run (null = no training)
//   extraId  second routine folded into the same day
//   label    what the day is called in the UI
//   kind     "train" | "rest" | "off" | "travel" | "test"
//   required counts toward the week's adherence target
//   note     day-specific coaching line
const PROGRAM_CALENDAR = [
  { week: 1,  offset: 0,   length: 7 },
  { week: 2,  offset: 7,   length: 7 },
  { week: 3,  offset: 14,  length: 7 },
  { week: 4,  offset: 21,  length: 7 },
  { week: 5,  offset: 28,  length: 7 },
  { week: 6,  offset: 35,  length: 7 },
  { week: 7,  offset: 42,  length: 7 },
  // Trimmed to 6 days (Sun Jul 19 – Fri Jul 24) so week 9 can open Saturday.
  { week: 8,  offset: 49,  length: 6 },
  // Week 9 opens SATURDAY Jul 25.
  {
    week: 9, offset: 55, length: 8,
    label: "Vacation-adjusted — comp lifts banked over the weekend",
    days: [
      { d: 0, id: "seed-sun-heavy-bench",                 label: "Heavy Bench",              kind: "train", required: true,  note: "Moved off Sunday — the priority lift goes on the fresh day. 3×2 @ 90%, PAUSED, RPE ≤ 8.5." },
      { d: 1, id: "seed-mon-squat-primary",               label: "Squat Primary",            kind: "train", required: true,  note: "Moved off Monday — this is the session you'd have missed. 3×2 @ 87.5%, RPE ≤ 8.5." },
      { d: 2, id: null,                                   label: "Rest — event",             kind: "rest",  required: false, note: "Bench and squat are both banked over the weekend. Nothing lost." },
      { d: 3, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
      { d: 4, id: "seed-wed-secondary-press-arms",        label: "Secondary Press + Arms",   kind: "train", required: true },
      { d: 5, id: "seed-thu-squat-volume-posterior-arms", label: "Squat Volume + Posterior", kind: "train", required: true,  note: "RDLs at RPE ≤ 7 — the hinge is maintenance, not a max." },
      { d: 6, id: "seed-fri-speed-bench-pump",            label: "Speed Bench + Pump",       kind: "train", required: false, note: "Bonus day — skip it first if elbows flag." },
      { d: 7, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
    ],
  },
  // Week 10 = the deload AND the trip. 15 days.
  {
    week: 10, offset: 63, length: 15,
    label: "Deload = vacation",
    days: [
      { d: 0,  id: "seed-sun-heavy-bench",          label: "Deload Bench",       kind: "train",  required: true,  note: "3×5 @ 62.5% ≈ 195, RPE ≤ 6. Half the accessory sets. No PRs." },
      { d: 1,  id: "seed-mon-squat-primary",        label: "Deload Squat",       kind: "train",  required: true,  note: "3×5 @ 62% ≈ 295, RPE ≤ 6." },
      { d: 2,  id: null,                            label: "Rest",               kind: "rest",   required: false },
      { d: 3,  id: "seed-wed-secondary-press-arms", label: "Light Press + Arms", kind: "train",  required: true,  note: "LAST session before the trip. 50% sets — leave the gym feeling fresh." },
      { d: 4,  id: null,                            label: "✈ Depart",           kind: "travel", required: false, note: "Vacation begins. This IS the deload — you already did the gym half." },
      { d: 5,  id: null,                            label: "Vacation",           kind: "off",    required: false, note: "Walk, swim, mobility. Don't go find a gym — this is the supercompensation window." },
      { d: 6,  id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 7,  id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 8,  id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 9,  id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 10, id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 11, id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 12, id: null,                            label: "Vacation",           kind: "off",    required: false },
      { d: 13, id: null,                            label: "Vacation",           kind: "off",    required: false, note: "~11 days off costs an advanced lifter no strength — it holds 2–3 weeks. You come back rusty, not weaker." },
      { d: 14, id: null,                            label: "Travel home",        kind: "off",    required: false, note: "Settle in. Extra rest day — training resumes tomorrow." },
    ],
  },
  // Week 11 = re-entry, Mon Aug 17 – Sat Aug 22 (6 days).
  {
    week: 11, offset: 78, length: 6,
    label: "Re-entry — resume Mon Aug 17",
    days: [
      { d: 0, id: "seed-sun-heavy-bench",                 label: "Re-entry Bench",           kind: "train", required: true,  note: "Moved off Sun Aug 16 (travel day). Hit the 3×5 @ 75% ≈ 235 back-offs; lighten or skip the 88% single until bar speed returns." },
      { d: 1, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
      { d: 2, id: "seed-mon-squat-primary", extraId: "seed-wed-secondary-press-arms", label: "Squat Primary + Arms", kind: "train", required: true, note: "Doubled up: squat re-entry (back-offs 3×5 @ 74% ≈ 355, ease the 86% single) plus the secondary press and arm work." },
      { d: 3, id: "seed-thu-squat-volume-posterior-arms", label: "Squat Volume + Posterior", kind: "train", required: true,  note: "Everything capped at RPE 7.5 this week." },
      { d: 4, id: "seed-fri-speed-bench-pump",            label: "Speed Bench (REQUIRED)",   kind: "train", required: true,  note: "4×3 @ 72% — speed bench is required from here to week 15. Drop pump work first, never the bar work." },
      { d: 5, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
    ],
  },
  { week: 12, offset: 84,  length: 7 },
  { week: 13, offset: 91,  length: 7 },
  { week: 14, offset: 98,  length: 7 },
  // Week 15: openers early, Friday is rest — nothing hard inside 72 h of test.
  {
    week: 15, offset: 105, length: 7,
    label: "Peak — openers early, then rest",
    days: [
      { d: 0, id: "seed-sun-heavy-bench",                 label: "Bench Opener",            kind: "train", required: true,  note: "One crisp single @ 93% ≈ 295 — this is your opener. If it grinds, the opener comes down." },
      { d: 1, id: "seed-mon-squat-primary",               label: "Squat Opener",            kind: "train", required: true,  note: "Single @ 93% ≈ 445 — your opener, ≥4 days before test day." },
      { d: 2, id: null,                                   label: "Rest",                    kind: "rest",  required: false },
      { d: 3, id: "seed-wed-secondary-press-arms",        label: "Light Press + Arms",      kind: "train", required: true,  note: "Volume −70%. Movement, not stimulus." },
      { d: 4, id: "seed-thu-squat-volume-posterior-arms", label: "Light Squat + Posterior", kind: "train", required: false, note: "Optional and light. Nothing hard inside 72 h of test day." },
      { d: 5, id: null,                                   label: "Rest — carb up",          kind: "rest",  required: false, note: "Friday is rest this week (it overrides the usual speed-bench day). Carb-load the final 3 days." },
      { d: 6, id: null,                                   label: "Rest",                    kind: "rest",  required: false },
    ],
  },
  // Week 16: TEST — Sun Sep 20, squat then bench.
  {
    week: 16, offset: 112, length: 7,
    label: "TEST — Sun Sep 20",
    days: [
      { d: 0, id: "seed-mon-squat-primary", extraId: "seed-sun-heavy-bench", label: "TEST DAY — squat, then bench", kind: "test", required: true, note: "Meet order: squat first, then bench. Full rest 5–8 min between attempts. Third attempts are earned — only if the second moved at ≤ RPE 9." },
      { d: 1, id: null, label: "Rest", kind: "rest", required: false, note: "Log your test maxes, then run the 6–8 week arm block before the next strength cycle." },
      { d: 2, id: null, label: "Rest", kind: "rest", required: false },
      { d: 3, id: null, label: "Rest", kind: "rest", required: false },
      { d: 4, id: null, label: "Rest", kind: "rest", required: false },
      { d: 5, id: null, label: "Rest", kind: "rest", required: false },
      { d: 6, id: null, label: "Rest", kind: "rest", required: false },
    ],
  },
];

function planRound5(x) { return Math.round(x / 5) * 5; }

function planWeekRow(week) {
  const w = Math.max(1, Math.min(PROGRAM_PLAN.totalWeeks, week));
  return PROGRAM_PLAN.weeks[w - 1];
}

function planCalendarRow(week) {
  return PROGRAM_CALENDAR[Math.max(1, Math.min(PROGRAM_PLAN.totalWeeks, week)) - 1];
}

function planWeekLength(week) { return planCalendarRow(week).length; }

// Whole days between the program start date and a moment in time. Negative
// before the cycle begins.
function planDayOffset(startDateIso, nowMs) {
  if (!startDateIso) return null;
  const start = new Date(startDateIso + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  const now = new Date(nowMs == null ? Date.now() : nowMs);
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - start) / 86400000);
}

// Program week number for a date. 1..16 during the cycle, 0 before the start
// date, 17 after test week. Week boundaries come from PROGRAM_CALENDAR, so the
// vacation stretch is respected.
function planWeekNumber(startDateIso, nowMs) {
  const off = planDayOffset(startDateIso, nowMs);
  if (off == null) return null;
  if (off < 0) return 0;
  for (const c of PROGRAM_CALENDAR) {
    if (off >= c.offset && off < c.offset + c.length) return c.week;
  }
  return PROGRAM_PLAN.totalWeeks + 1;
}

// Ms timestamp of the first day of a given program week.
function planWeekStartMs(startDateIso, week) {
  const start = new Date(startDateIso + "T00:00:00");
  if (week > PROGRAM_PLAN.totalWeeks) {
    // Past the last calendar week, keep extrapolating in sevens so post-cycle
    // date math still behaves.
    const last = PROGRAM_CALENDAR[PROGRAM_CALENDAR.length - 1];
    return start.getTime() + (last.offset + last.length + (week - PROGRAM_PLAN.totalWeeks - 1) * 7) * 86400000;
  }
  return start.getTime() + planCalendarRow(week).offset * 86400000;
}

// Ms timestamp of the first moment past the end of a program week.
function planWeekEndMs(startDateIso, week) {
  if (week > PROGRAM_PLAN.totalWeeks) return planWeekStartMs(startDateIso, week) + 7 * 86400000;
  return planWeekStartMs(startDateIso, week) + planWeekLength(week) * 86400000;
}

// The day-by-day schedule for a program week, resolved against real dates.
// Weeks without an override fall back to the standard Sun/Mon/Wed/Thu/Fri
// split (Fri required only in weeks 11–15).
function planWeekDays(startDateIso, week) {
  const c = planCalendarRow(week);
  const startMs = planWeekStartMs(startDateIso, week);
  const out = [];
  if (c.days) {
    for (const d of c.days) {
      const dateMs = startMs + d.d * 86400000;
      out.push({
        week, dateMs, dow: new Date(dateMs).getDay(),
        routineId: d.id || null, extraRoutineId: d.extraId || null,
        label: d.label, kind: d.kind, required: !!d.required, note: d.note || "",
      });
    }
    return out;
  }
  const friRequired = week >= 11 && week <= 15;
  for (let i = 0; i < c.length; i++) {
    const dateMs = startMs + i * 86400000;
    const dow = new Date(dateMs).getDay();
    const info = PLAN_DAYS.find((p) => p.dow === dow);
    out.push({
      week, dateMs, dow,
      routineId: info ? info.routineId : null, extraRoutineId: null,
      label: info ? info.label : "Rest",
      kind: info ? "train" : "rest",
      required: !!info && (info.dow !== 5 || friRequired),
      note: info && info.dow === 5 && !friRequired ? "Bonus day — skip it first if elbows ache or Wed pressing ran heavy." : "",
    });
  }
  return out;
}

// What today (or any date) is, per the calendar. Null outside the cycle.
function planDayFor(startDateIso, nowMs) {
  const week = planWeekNumber(startDateIso, nowMs);
  if (!week || week > PROGRAM_PLAN.totalWeeks) return null;
  const off = planDayOffset(startDateIso, nowMs);
  const idx = off - planCalendarRow(week).offset;
  return planWeekDays(startDateIso, week)[idx] || null;
}

// How many training days this week counts toward adherence.
function planRequiredSessions(week, startDateIso) {
  const iso = startDateIso || PROGRAM_PLAN.defaultStartDate;
  return planWeekDays(iso, week).filter((d) => d.required).length;
}

// "Jul 25 – Aug 1" for a program week.
function planWeekDateRangeText(startDateIso, week) {
  const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(planWeekStartMs(startDateIso, week))} – ${fmt(planWeekEndMs(startDateIso, week) - 86400000)}`;
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

// ---------------------------------------------------------------------------
// ACCESSORIES — straight off the sheet's "Daily Templates" tab.
// ---------------------------------------------------------------------------
// Sets/reps only; the load stays whatever was last logged (double progression:
// reps to the top of the range, then +5 lb). `reps` is the TOP of the printed
// range, so hitting it on every set is the trigger to add weight. A null block
// entry means the sheet drops the movement in that block — it stays in the
// routine as one optional set rather than vanishing mid-cycle.
const PLAN_ACCESSORIES = {
  "seed-sun-heavy-bench": [
    { id: "chest-supported-row",        label: "Upper back",                             Hypertrophy: { sets: 4, reps: 10, range: "8–10" },  Strength: { sets: 4, reps: 8,  range: "6–8" },  Bridge: { sets: 3, reps: 8,  range: "8" },     Peak: { sets: 2, reps: 8,  range: "8 light" }, Test: null },
    { id: "cable-curl",                 label: "Behind-body (stretch position)",         Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 2, reps: 10, range: "10" },   Bridge: { sets: 3, reps: 12, range: "10–12" }, Peak: null, Test: null },
    { id: "face-pull",                  label: "Shoulder health",                        Hypertrophy: { sets: 3, reps: 15, range: "15" },    Strength: { sets: 3, reps: 15, range: "15" },   Bridge: { sets: 3, reps: 15, range: "15" },    Peak: { sets: 2, reps: 15, range: "15" }, Test: null },
    { id: "triceps-pushdown",           label: "",                                       Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 3, reps: 10, range: "8–10" }, Bridge: { sets: 3, reps: 10, range: "10" },    Peak: null, Test: null },
  ],
  "seed-mon-squat-primary": [
    { id: "leg-press",                  label: "",                                       Hypertrophy: { sets: 3, reps: 10, range: "8–10" },  Strength: { sets: 2, reps: 8,  range: "8" },    Bridge: { sets: 2, reps: 8,  range: "8" },     Peak: null, Test: null },
    { id: "ab-wheel-rollout",           label: "Anti-flexion core (or Pallof press)",    Hypertrophy: { sets: 3, reps: 10, range: "3 sets" }, Strength: { sets: 3, reps: 10, range: "3 sets" }, Bridge: { sets: 3, reps: 10, range: "3 sets" }, Peak: { sets: 2, reps: 10, range: "2 sets" }, Test: null },
  ],
  "seed-wed-secondary-press-arms": [
    { id: "lat-pulldown",               label: "Weekly pulling (or chest-supported row)", Hypertrophy: { sets: 3, reps: 12, range: "8–12" },  Strength: { sets: 3, reps: 8,  range: "8" },   Bridge: { sets: 3, reps: 12, range: "8–12" },  Peak: null, Test: null },
    { id: "incline-dumbbell-curl",      label: "Stretch — 2s eccentric, full stretch",   Hypertrophy: { sets: 4, reps: 12, range: "8–12" },  Strength: { sets: 3, reps: 10, range: "8–10" }, Bridge: { sets: 4, reps: 12, range: "8–12" },  Peak: { sets: 2, reps: 10, range: "10" }, Test: null },
    { id: "hammer-curl",                label: "",                                       Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 3, reps: 10, range: "10" },   Bridge: { sets: 3, reps: 12, range: "10–12" }, Peak: null, Test: null },
    { id: "overhead-triceps-extension", label: "Long head",                              Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 3, reps: 10, range: "10" },   Bridge: { sets: 3, reps: 12, range: "10–12" }, Peak: null, Test: null },
  ],
  "seed-thu-squat-volume-posterior-arms": [
    { id: "romanian-deadlift",          label: "Hinge — RPE ≤ 7, never a max",           Hypertrophy: { sets: 3, reps: 8,  range: "8" },     Strength: { sets: 3, reps: 6,  range: "6" },    Bridge: { sets: 3, reps: 6,  range: "6" },     Peak: null, Test: null },
    { id: "leg-curl",                   label: "",                                       Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 3, reps: 10, range: "10" },   Bridge: { sets: 3, reps: 10, range: "10" },    Peak: null, Test: null },
    { id: "preacher-curl",              label: "Or spider curl — short-length/peak",     Hypertrophy: { sets: 4, reps: 15, range: "10–15" }, Strength: { sets: 3, reps: 10, range: "10" },   Bridge: { sets: 4, reps: 15, range: "10–15" }, Peak: null, Test: null },
    { id: "reverse-curl",               label: "Reverse EZ — brachialis/forearm",        Hypertrophy: { sets: 3, reps: 15, range: "12–15" }, Strength: { sets: 2, reps: 12, range: "12" },   Bridge: { sets: 3, reps: 15, range: "12–15" }, Peak: null, Test: null },
    { id: "skull-crusher",              label: "Or pushdown",                            Hypertrophy: { sets: 3, reps: 12, range: "10–12" }, Strength: { sets: 3, reps: 10, range: "8–10" }, Bridge: { sets: 3, reps: 10, range: "10" },    Peak: null, Test: null },
  ],
  "seed-fri-speed-bench-pump": [
    { id: "push-up",                    label: "Or band flye",                           Hypertrophy: { sets: 3, reps: 15, range: "15" },    Strength: { sets: 2, reps: 15, range: "15" },   Bridge: { sets: 2, reps: 15, range: "15" },    Peak: null, Test: null },
    { id: "ez-bar-curl",                label: "21s — 7 bottom + 7 top + 7 full",        Hypertrophy: { sets: 3, reps: 21, range: "2–3 rounds" }, Strength: { sets: 2, reps: 21, range: "2 rounds" }, Bridge: { sets: 3, reps: 21, range: "2–3 rounds" }, Peak: null, Test: null },
    { id: "rope-pushdown",              label: "",                                       Hypertrophy: { sets: 3, reps: 12, range: "10–15" }, Strength: { sets: 2, reps: 12, range: "12" },   Bridge: { sets: 3, reps: 12, range: "10–15" }, Peak: null, Test: null },
  ],
};

// Accessory scheme for a block, with the deload halving applied. A block the
// sheet drops the movement in comes back as one optional set.
function planAccessoryScheme(acc, block) {
  const scheme = acc[planBlockKey(block)];
  if (!scheme) return { sets: 1, reps: (acc.Bridge || acc.Hypertrophy).reps, range: "", optional: true };
  if (block === "Deload") return { ...scheme, sets: Math.max(1, Math.ceil(scheme.sets / 2)), optional: false };
  return { ...scheme, optional: false };
}

function planSetsArray(sets, reps, load) {
  return Array.from({ length: sets }, () => ({ weight: load, reps }));
}

// Full per-routine targets for one program week. Returns
// { [seedRoutineId]: { [exerciseId]: { note, sets: [{weight,reps},...], keepWeight? } } }
// Main lifts carry explicit loads; accessories set sets/reps only and keep
// whatever weight was last logged (keepWeight).
function planRoutineTargets(week, adjustments) {
  const row = planWeekRow(week);
  const adj = (adjustments && adjustments[String(week)]) || null;
  const block = row.block;
  const cap = row.rpeCap;
  const capTxt = block === "Test" ? "" : ` · top set RPE ≤ ${cap}`;
  const wkTag = `Wk ${row.week} · ${block}`;
  const reentry = week === 11;

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
  if (reentry) benchNote += " · RE-ENTRY: own the back-offs, lighten or skip the single until bar speed is normal";
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
  if (reentry) squatNote += " · RE-ENTRY: ease the single, own the back-offs";
  if (block === "Test") squatNote = `${wkTag}: opener ${PROGRAM_PLAN.attemptPlan.squat[0]} → second ${PROGRAM_PLAN.attemptPlan.squat[1]} → third ${PROGRAM_PLAN.attemptPlan.squat[2]} (earned: only if the second moved at ≤ RPE 9). Squat runs FIRST on test day.`;
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

  // --- Accessories: block-aware sets/reps, load carried over from last time ---
  for (const routineId of Object.keys(PLAN_ACCESSORIES)) {
    if (!out[routineId]) out[routineId] = {};
    for (const acc of PLAN_ACCESSORIES[routineId]) {
      const s = planAccessoryScheme(acc, block);
      const bits = [];
      if (acc.label) bits.push(acc.label);
      bits.push(`${s.sets}×${s.range || s.reps}`);
      if (s.optional) bits.push(block === "Test" ? "Test week — skip" : "Optional — accessories cut in the peak block");
      else if (block === "Deload") bits.push("Deload — half sets, no PRs");
      out[routineId][acc.id] = {
        note: bits.join(" · "),
        sets: planSetsArray(s.sets, s.reps, ""),
        keepWeight: true,
      };
    }
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
