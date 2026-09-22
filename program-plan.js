// Program plan — the FULL 16-week "Powerbuilding v4.0 — Upper + Quad" cycle:
// weekly loading, goals, rules, the training calendar, and per-day targets. Pure data
// + pure functions (no DOM, no app state) so app.js can drive day-aware routine
// targets and the coach engine off it.
//
// Weights in POUNDS, rounded to the nearest 5 lb off the oneRm inputs below.
//
// -------------------------------------------------------------------------
// 2026-09-21 — CYCLE REPLACED.
// -------------------------------------------------------------------------
// Alex cancelled the Sep 27 max test: he had already maxed four weeks early in week
// 12 of the old cycle (squat 500 @ RPE 9.5, bench 315 paused/comp-legal), so a test
// day six days out was re-measuring a number he already had. The new ask was a
// powerbuilding block — higher-rep work aimed at upper-body and quad size, with
// strength held rather than chased.
//
// WHAT CHANGED FROM v3:
//   • 17 weeks -> 16. Start date 2026-05-31 -> 2026-09-21. No Test week; week 16 is a
//     RE-EXPRESS week (one 95% double per lift, RPE cap 8) that updates the 1RM inputs
//     without a max attempt.
//   • Week 1 is a compressed SIX-day week: Alex started on Monday Sep 21 and asked
//     to run days 1-5 straight Mon-Fri with no mid-week rest. Saturday Sep 26 is off
//     and the normal Sun-Sat rhythm starts with week 2 on Sep 27. Only the calendar
//     moves - week 1's loads are the cycle's lightest, which is what makes five
//     straight days survivable.
//   • Split rebuilt around 3 upper days and 2 lower days (was 2 bench, 2 squat, 1 speed).
//     Sun upper power · Mon lower power · Wed upper hypertrophy (push) · Thu lower
//     hypertrophy (quads) · Fri upper hypertrophy (pull). All five are required.
//   • Every comp-lift day is now PRIMER + BACK-OFFS. The primer is the strength dose:
//     roughly 3-6 weekly sets above 80% at RPE 7.5-9.5 is the documented minimum
//     effective dose for a powerlifter to hold (and add) 1RM, and blocks A/B deliver
//     exactly that while the back-offs and accessories do the growing. Block C turns
//     the primer into multiple heavy sets.
//   • Accessory volume is keyed off a per-week TIER (A/B/C/D) rather than the block
//     name, because blocks A and B are both "Hypertrophy" at different volumes.
//   • Speed bench, Larsen press and the Thursday pause squat are gone. Thursday's quad
//     work is machine-based on purpose — quad volume without a second heavy axial load
//     on an active lower back.
//
// EXERCISE-SELECTION NOTES (the choices that are not obvious):
//   • Leg extension is done with the HIPS EXTENDED (seat reclined toward ~40 deg).
//     A 10-week trial found that grew rectus femoris far more than the upright setup
//     with identical vastus growth, and rectus femoris is the one quad head squats and
//     presses barely load in a stretched position.
//   • The triceps slot on Wednesday is OVERHEAD and stays overhead. A 12-week
//     within-subject trial had overhead extensions grow the long head ~28.5% vs ~19.6%
//     for pushdowns, and they beat pushdowns on the other two heads as well.
//   • Lateral raises are on cables because the resistance curve is friendlier at the
//     bottom, not because dumbbells are worse — an 8-week within-participant trial
//     found them equivalent for lateral delt growth. Swap freely.
//   • Every row is chest-supported and the only hinge is a hip thrust. That is the
//     lower back, not a preference.
//
// STANDING INJURY CONSTRAINTS:
//   • Lower back ACTIVE (injury log, 2026-09-09). No conventional deadlift, RDL, good
//     morning, bent-over barbell row, unsupported loaded hinge. Anti-flexion /
//     anti-rotation core only. The old v3.2 spreadsheet's "back cleared" line was never
//     reconciled and is treated as stale.
//   • Right shoulder — subacromial pain pattern (2026-08-18). Alex asked on 2026-09-21
//     for the plan to be built WITHOUT accommodations and will modify it himself, so
//     the delt work here is programmed normally.
//
// OPEN ITEM CARRIED FORWARD: the bench 1RM is still the conservative 315. The RPE of
// the 2026-08-27 paused single was never recorded (RPE 9 -> 330, 9.5 -> 322.5,
// 10 -> 315). Week 4's 285x2 and week 9's 290x2, both capped at RPE 8, are the
// instruments that settle it. Log the RPE and update oneRm.bench.

const PROGRAM_PLAN_VERSION = 9;

const PROGRAM_PLAN = {
  name: "Powerbuilding v4.0 — Upper + Quad",
  totalWeeks: 16,
  // DAY 1 of the cycle — a MONDAY this time (compressed six-day week 1).
  defaultStartDate: "2026-09-21",
  // bench: held at the conservative comp-legal 315 (see the open item above).
  // squat: the tested 500 from week 12 of the last cycle, not the 510 e1RM.
  oneRm: { bench: 315, squat: 500 },
  goals: {
    // A powerbuilding block is not a peaking block. Holding is a win; the upside is
    // whatever the extra tissue buys by week 16.
    bench: { lo: 315, hi: 330 },
    squat: { lo: 500, hi: 520 },
  },
  // Week 16 re-express doubles (95%), capped at RPE 8. NOT attempts.
  reExpress: { bench: 300, squat: 475 },
  // Weekly DIRECT set targets on exercises tagged Biceps/Triceps in exercises-data.js.
  // Fractional totals (counting pressing and pulling at half a set) run ~18-19 and
  // ~21-23 respectively; these are the direct counts the app can actually see.
  armSets: { biceps: [10, 12], triceps: [12, 14] },
  rules: {
    primer: "Every comp-lift day opens with a heavy primer before the volume work. That is the strength dose - roughly 3-6 weekly sets above 80% at RPE 7.5-9.5 is what holds a 1RM. Never skip it to save time; cut a back-off set instead.",
    progression: "Add load only when the top set is at or under the RPE cap. The cap beats the % ladder: if last week's top set exceeded it, repeat that load.",
    backOffs: "Back-off sets end 1-2 reps in reserve. The % is a starting point; the RPE governs.",
    accessories: "Double progression. Hit the TOP of the printed rep range on every set, then add load: 2.5-5 lb upper isolation, 5 lb upper compound, 10 lb lower. Last set 0-2 reps in reserve.",
    fatigue: "2 sessions in a row over target RPE -> pull the week's loads 5%. Sleep or appetite sliding in block B -> hold loads, do not add.",
    deloads: "Weeks 5, 10 and 15 are mandatory: half the accessory sets, no primers, no PRs, no make-up work.",
    rotation: "Rotate at most ONE exercise per muscle at a block boundary, and only if it stalled or a joint complained. Everything else stays so the double progression keeps its history.",
    perSession: "No muscle gets more than ~10-11 hard sets in one session - past that the returns flatten, which is why the volume is split across two or three exposures.",
    hinge: "Lower back ACTIVE. No conventional deadlift, RDL, good morning, bent-over barbell row or unsupported loaded hinge. The hinge slot is a HIP THRUST at RPE <= 7. Every row is chest-supported. Core is anti-flexion / anti-rotation only. This is not a conflict to resolve - it is the design until the back is cleared in writing.",
    shoulder: "Right shoulder subacromial pain pattern (2026-08-18) is NOT accommodated here at Alex's request (2026-09-21) - he modifies the delt and pressing slots himself. Shoulder-friendly versions: scapular-plane raises, thumbs neutral or up, ROM capped below the painful arc, cables and machines over heavy dumbbells. Refer out on night pain, pain past the elbow, numbness, or weakness holding the arm at 90 deg.",
    noMaxing: "There is no max test in this cycle. Week 16 is a 95% double capped at RPE 8 - stop the set the moment bar speed drops.",
  },
  // One row per week. bench/squat = the PRIMER (top set) in loading weeks and the
  // straight-sets prescription on deloads; benchBO/squatBO = back-off sets.
  // tier drives accessory volume; armScale drives the coach's weekly arm targets.
  weeks: [
    { week: 1,  block: "Hypertrophy", tier: "A", rpeCap: 8,
      bench: { sets: 1, reps: 3, pct: 82.5, load: 260 }, benchBO: { sets: 4, reps: 8, pct: 67.5, load: 215 },
      squat: { sets: 1, reps: 3, pct: 80.0, load: 400 }, squatBO: { sets: 4, reps: 8, pct: 65.0, load: 325 },
      note: "Block A wk1 - Accumulation I. COMPRESSED START: days 1-5 run Mon Sep 21 through Fri Sep 25 with no mid-week rest, Sat off, then the normal Sun-start week begins Sep 27. Five straight days is the one thing this cycle asks that the rest of it does not - it works because week 1 is the lightest week (82.5% primer, 67.5% back-offs) and the job is learning the new lifts, not loading them. If day 4 or 5 feels flat, drop an accessory set rather than the primer. Back-offs: last set 1-2 reps in reserve." },
    { week: 2,  block: "Hypertrophy", tier: "A", rpeCap: 8,
      bench: { sets: 1, reps: 3, pct: 85.0, load: 270 }, benchBO: { sets: 4, reps: 8, pct: 70.0, load: 220 },
      squat: { sets: 1, reps: 3, pct: 82.5, load: 415 }, squatBO: { sets: 4, reps: 8, pct: 67.5, load: 340 },
      note: "Block A wk2. Same sets, +2.5% everywhere. Log accessory loads this week - block B's double progression runs off them." },
    { week: 3,  block: "Hypertrophy", tier: "A", rpeCap: 8,
      bench: { sets: 1, reps: 2, pct: 87.5, load: 275 }, benchBO: { sets: 4, reps: 7, pct: 72.5, load: 230 },
      squat: { sets: 1, reps: 2, pct: 85.0, load: 425 }, squatBO: { sets: 4, reps: 7, pct: 70.0, load: 350 },
      note: "Block A wk3. Primer drops to a double as the % climbs. Back-offs lose a rep, gain load." },
    { week: 4,  block: "Hypertrophy", tier: "A", rpeCap: 8,
      bench: { sets: 1, reps: 2, pct: 90.0, load: 285 }, benchBO: { sets: 5, reps: 6, pct: 75.0, load: 235 },
      squat: { sets: 1, reps: 2, pct: 87.5, load: 440 }, squatBO: { sets: 4, reps: 6, pct: 72.5, load: 365 },
      note: "Block A wk4 - heaviest accumulation week. The 90% bench double at RPE <= 8 is your first read on whether the bench 1RM input (315) is honest." },
    { week: 5,  block: "Deload",      tier: "D", rpeCap: 6, armScale: 0.5,
      bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,
      squat: { sets: 3, reps: 5, pct: 62.0, load: 310 }, squatBO: null,
      note: "DELOAD. No primers, half the accessory sets, zero PRs. Loads are a walk. This is where block A turns into muscle." },
    { week: 6,  block: "Hypertrophy", tier: "B", rpeCap: 8,
      bench: { sets: 1, reps: 3, pct: 85.0, load: 270 }, benchBO: { sets: 5, reps: 8, pct: 70.0, load: 220 },
      squat: { sets: 1, reps: 3, pct: 82.5, load: 415 }, squatBO: { sets: 4, reps: 8, pct: 67.5, load: 340 },
      note: "Block B wk6 - Accumulation II, the highest-volume block of the cycle. Exercise rotation: swap ONE slot per muscle if a lift stalled or a joint complained in block A, keep the rest." },
    { week: 7,  block: "Hypertrophy", tier: "B", rpeCap: 8,
      bench: { sets: 1, reps: 3, pct: 87.5, load: 275 }, benchBO: { sets: 5, reps: 8, pct: 72.5, load: 230 },
      squat: { sets: 1, reps: 3, pct: 85.0, load: 425 }, squatBO: { sets: 4, reps: 7, pct: 70.0, load: 350 },
      note: "Block B wk7. Squat back-offs add a set. If sleep or appetite slides this week, that is the volume talking - hold loads instead of adding." },
    { week: 8,  block: "Hypertrophy", tier: "B", rpeCap: 8,
      bench: { sets: 1, reps: 2, pct: 90.0, load: 285 }, benchBO: { sets: 5, reps: 7, pct: 75.0, load: 235 },
      squat: { sets: 1, reps: 2, pct: 87.5, load: 440 }, squatBO: { sets: 4, reps: 6, pct: 72.5, load: 365 },
      note: "Block B wk8. Highest accessory volume of the whole plan. Two sessions in a row over the RPE cap = pull the week's loads 5%." },
    { week: 9,  block: "Hypertrophy", tier: "B", rpeCap: 8,
      bench: { sets: 1, reps: 2, pct: 92.5, load: 290 }, benchBO: { sets: 5, reps: 6, pct: 77.5, load: 245 },
      squat: { sets: 1, reps: 2, pct: 90.0, load: 450 }, squatBO: { sets: 4, reps: 6, pct: 75.0, load: 375 },
      note: "Block B wk9 - peak week of the block. 290x2 bench / 450x2 squat at RPE <= 8 is the checkpoint: if both move clean, the 1RM inputs are conservative and block C starts from a higher base." },
    { week: 10, block: "Deload",      tier: "D", rpeCap: 6, armScale: 0.5,
      bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,
      squat: { sets: 3, reps: 5, pct: 62.0, load: 310 }, squatBO: null,
      note: "DELOAD. Same rules as week 5. Do not make up missed block-B work here." },
    { week: 11, block: "Strength",    tier: "C", rpeCap: 8.5,
      bench: { sets: 3, reps: 3, pct: 85.0, load: 270 }, benchBO: { sets: 3, reps: 6, pct: 72.5, load: 230 },
      squat: { sets: 3, reps: 3, pct: 82.5, load: 415 }, squatBO: { sets: 3, reps: 6, pct: 70.0, load: 350 },
      note: "Block C wk11 - Intensification. The primer becomes the main event: multiple heavy sets, not one. Accessory sets drop ~20% so the bar work gets the recovery. Nothing is deleted." },
    { week: 12, block: "Strength",    tier: "C", rpeCap: 8.5,
      bench: { sets: 4, reps: 3, pct: 87.5, load: 275 }, benchBO: { sets: 3, reps: 6, pct: 75.0, load: 235 },
      squat: { sets: 3, reps: 3, pct: 85.0, load: 425 }, squatBO: { sets: 3, reps: 5, pct: 72.5, load: 365 },
      note: "Block C wk12. Bench adds a heavy set. Rest 3-4 min between primer sets - these are strength sets, not a circuit." },
    { week: 13, block: "Strength",    tier: "C", rpeCap: 8.5,
      bench: { sets: 4, reps: 2, pct: 90.0, load: 285 }, benchBO: { sets: 3, reps: 5, pct: 77.5, load: 245 },
      squat: { sets: 4, reps: 2, pct: 87.5, load: 440 }, squatBO: { sets: 3, reps: 5, pct: 75.0, load: 375 },
      note: "Block C wk13. Doubles at 90%/87.5%. This is the week the size you built in A and B starts showing up as bar weight." },
    { week: 14, block: "Strength",    tier: "C", rpeCap: 8.5,
      bench: { sets: 3, reps: 2, pct: 92.5, load: 290 }, benchBO: { sets: 3, reps: 5, pct: 80.0, load: 250 },
      squat: { sets: 3, reps: 2, pct: 90.0, load: 450 }, squatBO: { sets: 3, reps: 4, pct: 77.5, load: 390 },
      note: "Block C wk14 - heaviest week of the cycle, and it lands Dec 20-26. Holidays plus the heaviest week is a bad pairing: if travel or eating goes sideways, swap weeks 14 and 15 (deload over Christmas, heavy week Dec 27-Jan 2) rather than grinding it. Either way, stop at the cap - a grinder here costs you week 16." },
    { week: 15, block: "Deload",      tier: "D", rpeCap: 6, armScale: 0.5,
      bench: { sets: 3, reps: 5, pct: 65.0, load: 205 }, benchBO: null,
      squat: { sets: 3, reps: 5, pct: 62.0, load: 310 }, squatBO: null,
      note: "DELOAD into the re-express week, Dec 27 - Jan 2. Slightly heavier than the other deloads (65%) because week 16 opens with a 95% double and you should not walk into that flat. If you swapped this with week 14, this is the heavy week instead." },
    { week: 16, block: "Re-express",  tier: "D", rpeCap: 8, armScale: 0.5,
      bench: { sets: 1, reps: 2, pct: 95.0, load: 300 }, benchBO: { sets: 2, reps: 3, pct: 80.0, load: 250 },
      squat: { sets: 1, reps: 2, pct: 95.0, load: 475 }, squatBO: { sets: 2, reps: 3, pct: 77.5, load: 390 },
      note: "RE-EXPRESS WEEK - not a max test. One double at 95% per lift, capped at RPE 8, then light back-offs. A 300x2 @ RPE 8 back-solves to a ~340 e1RM; 475x2 @ RPE 8 to ~540. Stop the set the moment bar speed drops - the point is a number you can trust, not a PR attempt. Feed the result into the 1RM inputs and either run this cycle again from a new base or hand it to a peaking block." },
  ],
};

// Which weekday (0=Sun..6=Sat) each seeded routine belongs to. All five days
// are required for adherence in this cycle - there is no bonus day.
const PLAN_DAYS = [
  { routineId: "seed-sun-upper-power", dow: 0, label: "Upper Power" },
  { routineId: "seed-mon-lower-power", dow: 1, label: "Lower Power" },
  { routineId: "seed-wed-upper-push", dow: 3, label: "Upper Hyp (Push)" },
  { routineId: "seed-thu-lower-hyp", dow: 4, label: "Lower Hyp (Quads)" },
  { routineId: "seed-fri-upper-pull", dow: 5, label: "Upper Hyp (Pull)" },
];

// ---------------------------------------------------------------------------
// CALENDAR
// ---------------------------------------------------------------------------
// One entry per program week. `offset` = days from the program start date to the
// first day of that week; `length` = how many days the week occupies. Week 1 is a
// compressed six-day week with an explicit `days` override (see below); weeks 2-16
// are plain Sun-Sat sevens.
const PROGRAM_CALENDAR = [
  // WEEK 1 IS SIX DAYS (Mon Sep 21 - Sat Sep 26). Alex started on a Monday and
  // asked to run days 1-5 straight through Mon-Fri with no mid-week rest, so the
  // week is compressed and then the calendar lands on the normal Sun-Sat rhythm
  // from week 2 (Sun Sep 27) onward. Loads and blocks are untouched - only the
  // calendar moves.
  {
    week: 1, offset: 0, length: 6,
    label: "Compressed start - five straight days, Mon Sep 21 to Fri Sep 25",
    days: [
      { d: 0, id: "seed-sun-upper-power", label: "Day 1 · Upper Power", kind: "train", required: true,  note: "Day 1 of the cycle, moved to Monday because that is when you started. Primer is one crisp top set, not a max." },
      { d: 1, id: "seed-mon-lower-power", label: "Day 2 · Lower Power", kind: "train", required: true,  note: "Back-to-back with yesterday by choice - no mid-week rest this week. Week 1 is the lightest week of the cycle, which is what makes that fine." },
      { d: 2, id: "seed-wed-upper-push", label: "Day 3 · Upper Hyp (Push)", kind: "train", required: true,  note: "Day 3. This is where the normal schedule would have put you anyway." },
      { d: 3, id: "seed-thu-lower-hyp", label: "Day 4 · Lower Hyp (Quads)", kind: "train", required: true,  note: "Day 4. If yesterday's pressing felt flat, drop an accessory set here - not the hack squat." },
      { d: 4, id: "seed-fri-upper-pull", label: "Day 5 · Upper Hyp (Pull)", kind: "train", required: true,  note: "Day 5, and the fifth straight training day. Get through it, then two days off before the normal Sun-start week begins Sep 27." },
      { d: 5, id: null, label: "Off", kind: "off", required: false, note: "Earned. Normal Sun-start week begins tomorrow." },
    ],
  },
  { week: 2,  offset: 6,   length: 7 },
  { week: 3,  offset: 13,  length: 7 },
  { week: 4,  offset: 20,  length: 7 },
  { week: 5,  offset: 27,  length: 7 },
  { week: 6,  offset: 34,  length: 7 },
  { week: 7,  offset: 41,  length: 7 },
  { week: 8,  offset: 48,  length: 7 },
  { week: 9,  offset: 55,  length: 7 },
  { week: 10, offset: 62,  length: 7 },
  { week: 11, offset: 69,  length: 7 },
  { week: 12, offset: 76,  length: 7 },
  { week: 13, offset: 83,  length: 7 },
  { week: 14, offset: 90,  length: 7 },
  { week: 15, offset: 97,  length: 7 },
  { week: 16, offset: 104, length: 7 },
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

// DST-SAFE DATE MATH (fixed 2026-09-21). The v3 helpers added days by adding
// 86 400 000 ms, which drifts an hour across a DST boundary and can hand back the
// wrong weekday. v3 ran May–September and never crossed one; this cycle runs
// Sep 21 2026 – Jan 9 2027 and crosses Nov 1, which silently shifted every week
// from week 6 on by a day. These two helpers work in local calendar days instead.
function planLocalDayNum(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function planDateAtOffset(startDateIso, days) {
  const d = new Date(startDateIso + "T00:00:00");
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Whole days between the program start date and a moment in time. Negative
// before the cycle begins.
function planDayOffset(startDateIso, nowMs) {
  if (!startDateIso) return null;
  const start = new Date(startDateIso + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  const now = new Date(nowMs == null ? Date.now() : nowMs);
  return planLocalDayNum(now) - planLocalDayNum(start);
}

// Program week number for a date. 1..16 during the cycle, 0 before the start
// date, 17 after the last week.
function planWeekNumber(startDateIso, nowMs) {
  const off = planDayOffset(startDateIso, nowMs);
  if (off == null) return null;
  if (off < 0) return 0;
  for (const c of PROGRAM_CALENDAR) {
    if (off >= c.offset && off < c.offset + c.length) return c.week;
  }
  return PROGRAM_PLAN.totalWeeks + 1;
}

// Day offset from the cycle start to the first day of a program week.
function planWeekOffset(week) {
  if (week > PROGRAM_PLAN.totalWeeks) {
    const last = PROGRAM_CALENDAR[PROGRAM_CALENDAR.length - 1];
    return last.offset + last.length + (week - PROGRAM_PLAN.totalWeeks - 1) * 7;
  }
  return planCalendarRow(week).offset;
}

// Ms timestamp of local midnight on the first day of a given program week.
function planWeekStartMs(startDateIso, week) {
  return planDateAtOffset(startDateIso, planWeekOffset(week)).getTime();
}

// Ms timestamp of the first moment past the end of a program week.
function planWeekEndMs(startDateIso, week) {
  const len = week > PROGRAM_PLAN.totalWeeks ? 7 : planWeekLength(week);
  return planDateAtOffset(startDateIso, planWeekOffset(week) + len).getTime();
}

// The day-by-day schedule for a program week, resolved against real dates.
function planWeekDays(startDateIso, week) {
  const c = planCalendarRow(week);
  const out = [];
  const base = planWeekOffset(week);
  if (c.days) {
    for (const d of c.days) {
      const dateMs = planDateAtOffset(startDateIso, base + d.d).getTime();
      out.push({
        week, dateMs, dow: new Date(dateMs).getDay(),
        routineId: d.id || null, extraRoutineId: d.extraId || null,
        label: d.label, kind: d.kind, required: !!d.required, note: d.note || "",
      });
    }
    return out;
  }
  for (let i = 0; i < c.length; i++) {
    const dateMs = planDateAtOffset(startDateIso, base + i).getTime();
    const dow = new Date(dateMs).getDay();
    const info = PLAN_DAYS.find((p) => p.dow === dow);
    out.push({
      week, dateMs, dow,
      routineId: info ? info.routineId : null, extraRoutineId: null,
      label: info ? info.label : (dow === 6 ? "Off" : "Rest"),
      kind: info ? "train" : (dow === 6 ? "off" : "rest"),
      required: !!info,
      note: info ? "" : (dow === 2
        ? "Mid-week rest. Walk, eat, sleep - the growing happens here."
        : "Off. An optional 20-minute arm or delt pump is fine; it is not programmed."),
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

// "Sep 21 - Sep 26" for a program week.
function planWeekDateRangeText(startDateIso, week) {
  const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const last = planDateAtOffset(startDateIso, planWeekOffset(week) + planWeekLength(week) - 1).getTime();
  return `${fmt(planWeekStartMs(startDateIso, week))} – ${fmt(last)}`;
}

// Adjustments the coach suggested and the user applied:
// { bench: <topSetLoadOverride>, squat: <...>, scale: <e.g. 0.95> }.
function planApplyAdjustment(load, adj, liftKey) {
  let out = load;
  if (adj && typeof adj[liftKey] === "number" && liftKey) out = adj[liftKey];
  if (adj && typeof adj.scale === "number") out = out * adj.scale;
  return planRound5(out);
}

// ---------------------------------------------------------------------------
// %-OF-1RM ACCESSORY LIFTS (Wednesday). Loads track the cycle 1RM input rather
// than the day's comp load, so they move when the 1RM does.
// ---------------------------------------------------------------------------
const PLAN_PCT_LIFTS = {
  "close-grip-bench-press": { lift: "bench",
    A: { pct: 0.72, reps: 8, range: "6-8" },
    B: { pct: 0.74, reps: 8, range: "6-8" },
    C: { pct: 0.78, reps: 6, range: "4-6" },
    D: { pct: 0.62, reps: 8, range: "8" },
  },
  "incline-barbell-bench-press": { lift: "bench",
    A: { pct: 0.58, reps: 12, range: "8-12" },
    B: { pct: 0.6, reps: 12, range: "8-12" },
    C: { pct: 0.65, reps: 10, range: "6-10" },
    D: { pct: 0.52, reps: 10, range: "10" },
  },
};

// ---------------------------------------------------------------------------
// ACCESSORIES — sets by TIER. Load stays whatever was last logged (double
// progression: reps to the top of the range, then add weight). `reps` is the TOP
// of the printed range, so hitting it on every set is the trigger to add load.
// ---------------------------------------------------------------------------
const PLAN_ACCESSORIES = {
  "seed-sun-upper-power": [
    { id: "incline-dumbbell-press", label: "Chest - deep stretch, 2s eccentric", A: { sets: 3, reps: 12, range: "8–12" }, B: { sets: 3, reps: 12, range: "8–12" }, C: { sets: 3, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "chest-supported-row", label: "Back - chest stays on the pad (back-safe row)", A: { sets: 4, reps: 12, range: "8–12" }, B: { sets: 5, reps: 12, range: "8–12" }, C: { sets: 4, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "cable-crossover", label: "Chest - lengthened, let the arms travel behind the torso", A: { sets: 3, reps: 15, range: "12–15" }, B: { sets: 3, reps: 15, range: "12–15" }, C: { sets: 2, reps: 15, range: "12–15" }, D: { sets: 2, reps: 15, range: "12–15" } },
    { id: "triceps-pushdown", label: "Triceps", A: { sets: 3, reps: 15, range: "10–15" }, B: { sets: 3, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "face-pull", label: "Rear delt / shoulder health", A: { sets: 3, reps: 20, range: "15–20" }, B: { sets: 3, reps: 20, range: "15–20" }, C: { sets: 3, reps: 20, range: "15–20" }, D: { sets: 2, reps: 20, range: "15–20" } },
  ],
  "seed-mon-lower-power": [
    { id: "leg-press", label: "Quads - feet low and narrow, knees travel, deep as the back allows", A: { sets: 2, reps: 15, range: "10–15" }, B: { sets: 3, reps: 15, range: "10–15" }, C: { sets: 2, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "seated-leg-curl", label: "Hamstrings - seated beats lying for stretch", A: { sets: 3, reps: 15, range: "10–15" }, B: { sets: 3, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "calf-raise", label: "Calves - 2s pause in the stretch", A: { sets: 3, reps: 15, range: "10–15" }, B: { sets: 4, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "pallof-press", label: "Anti-rotation core - the only core pattern the back allows", A: { sets: 3, reps: 12, range: "12/side" }, B: { sets: 3, reps: 12, range: "12/side" }, C: { sets: 3, reps: 12, range: "12/side" }, D: { sets: 2, reps: 12, range: "12/side" } },
  ],
  "seed-wed-upper-push": [
    { id: "cable-lateral-raise", label: "Side delts - cable = dumbbell for growth, pick what feels better", A: { sets: 4, reps: 20, range: "12–20" }, B: { sets: 5, reps: 20, range: "12–20" }, C: { sets: 4, reps: 20, range: "12–20" }, D: { sets: 2, reps: 20, range: "12–20" } },
    { id: "overhead-cable-extension", label: "Triceps LONG HEAD - overhead beats pushdowns, this slot is not optional", A: { sets: 4, reps: 15, range: "10–15" }, B: { sets: 4, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "incline-dumbbell-curl", label: "Biceps - stretched position, 2s eccentric", A: { sets: 4, reps: 12, range: "8–12" }, B: { sets: 4, reps: 12, range: "8–12" }, C: { sets: 3, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "reverse-pec-deck", label: "Rear delts", A: { sets: 3, reps: 20, range: "15–20" }, B: { sets: 3, reps: 20, range: "15–20" }, C: { sets: 3, reps: 20, range: "15–20" }, D: { sets: 2, reps: 20, range: "15–20" } },
  ],
  "seed-thu-lower-hyp": [
    { id: "hack-squat", label: "Quads - machine, minimal spinal load. Heaviest quad work of the week", A: { sets: 3, reps: 10, range: "6–10" }, B: { sets: 4, reps: 10, range: "6–10" }, C: { sets: 4, reps: 10, range: "6–10" }, D: { sets: 2, reps: 10, range: "6–10" } },
    { id: "bulgarian-split-squat", label: "Quads unilateral - torso upright, long stride", A: { sets: 3, reps: 12, range: "8–12" }, B: { sets: 2, reps: 12, range: "8–12" }, C: { sets: 2, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "leg-extension", label: "Quads - HIPS EXTENDED (recline the seat back). Hits rectus femoris, which squats and presses barely touch", A: { sets: 3, reps: 20, range: "12–20" }, B: { sets: 4, reps: 20, range: "12–20" }, C: { sets: 3, reps: 20, range: "12–20" }, D: { sets: 2, reps: 20, range: "12–20" } },
    { id: "hip-thrust", label: "Glutes/hams - RPE <= 7, never a max. Hinge substitute while the back is active", A: { sets: 3, reps: 12, range: "8–12" }, B: { sets: 3, reps: 12, range: "8–12" }, C: { sets: 3, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "leg-curl", label: "Hamstrings", A: { sets: 3, reps: 15, range: "10–15" }, B: { sets: 3, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "seated-calf-raise", label: "Calves - soleus", A: { sets: 3, reps: 20, range: "12–20" }, B: { sets: 3, reps: 20, range: "12–20" }, C: { sets: 3, reps: 20, range: "12–20" }, D: { sets: 2, reps: 20, range: "12–20" } },
  ],
  "seed-fri-upper-pull": [
    { id: "lat-pulldown", label: "Lats - full stretch at the top, no torso swing", A: { sets: 4, reps: 12, range: "8–12" }, B: { sets: 5, reps: 12, range: "8–12" }, C: { sets: 4, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "seated-cable-row", label: "Mid-back - chest-supported machine row is fine; no bent-over BB row", A: { sets: 4, reps: 12, range: "8–12" }, B: { sets: 4, reps: 12, range: "8–12" }, C: { sets: 3, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "seated-dumbbell-press", label: "Delts - seated with back support (standing axial load is out)", A: { sets: 3, reps: 12, range: "8–12" }, B: { sets: 4, reps: 12, range: "8–12" }, C: { sets: 3, reps: 12, range: "8–12" }, D: { sets: 2, reps: 12, range: "8–12" } },
    { id: "cable-lateral-raise", label: "Side delts - second exposure of the week", A: { sets: 4, reps: 20, range: "12–20" }, B: { sets: 5, reps: 20, range: "12–20" }, C: { sets: 4, reps: 20, range: "12–20" }, D: { sets: 2, reps: 20, range: "12–20" } },
    { id: "preacher-curl", label: "Biceps short-length. Superset with the pushdown", A: { sets: 4, reps: 15, range: "10–15" }, B: { sets: 5, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "hammer-curl", label: "Brachialis/forearm - thickens the arm", A: { sets: 3, reps: 15, range: "10–15" }, B: { sets: 3, reps: 15, range: "10–15" }, C: { sets: 3, reps: 15, range: "10–15" }, D: { sets: 2, reps: 15, range: "10–15" } },
    { id: "rope-pushdown", label: "Triceps finisher - superset with the preacher curl", A: { sets: 3, reps: 15, range: "12–15" }, B: { sets: 3, reps: 15, range: "12–15" }, C: { sets: 2, reps: 15, range: "12–15" }, D: { sets: 2, reps: 15, range: "12–15" } },
  ],
};

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
  const scaleOnly = { scale: adj && adj.scale };
  const tier = row.tier;
  const cap = row.rpeCap;
  const wkTag = `Wk ${row.week} · ${row.block}`;
  const out = {};

  // --- Comp lifts: primer (+ back-offs) ------------------------------------
  const COMP = [
    { routine: "seed-sun-upper-power", exercise: "barbell-bench-press", key: "bench",
      style: "PAUSED (comp command)" },
    { routine: "seed-mon-lower-power", exercise: "squat", key: "squat",
      style: "comp stance and depth — back-offs at the same depth" },
  ];
  for (const c of COMP) {
    const top = c.key === "bench" ? row.bench : row.squat;
    const bo = c.key === "bench" ? row.benchBO : row.squatBO;
    const load = planApplyAdjustment(top.load, adj, c.key);
    const sets = planSetsArray(top.sets, top.reps, load);
    let note;
    if (bo) {
      const boLoad = planApplyAdjustment(bo.load, scaleOnly, null);
      sets.push(...planSetsArray(bo.sets, bo.reps, boLoad));
      note = `${wkTag}: PRIMER ${top.sets}×${top.reps} @ ${load} · RPE ≤ ${cap} · ${c.style}`
           + ` · then back-offs ${bo.sets}×${bo.reps} @ ${boLoad} · last set 1–2 RIR`;
      if (row.block === "Re-express") {
        note = `${wkTag}: RE-EXPRESS ${top.sets}×${top.reps} @ ${load} · RPE CAP ${cap} — this is not a max.`
             + ` Stop the set the moment bar speed drops. Log the RPE; it sets the next cycle's 1RM input.`
             + ` Then ${bo.sets}×${bo.reps} @ ${boLoad}.`;
      }
    } else {
      note = `${wkTag}: ${top.sets}×${top.reps} @ ${load} · RPE ≤ ${cap} · DELOAD — no primer, no PRs`;
    }
    out[c.routine] = { [c.exercise]: { note, sets } };
  }

  // --- Wednesday %-of-1RM lifts --------------------------------------------
  for (const [exId, cfg] of Object.entries(PLAN_PCT_LIFTS)) {
    const scheme = cfg[tier];
    const oneRm = PROGRAM_PLAN.oneRm[cfg.lift];
    const load = planApplyAdjustment(oneRm * scheme.pct, scaleOnly, null);
    if (!out["seed-wed-upper-push"]) out["seed-wed-upper-push"] = {};
    out["seed-wed-upper-push"][exId] = {
      note: `${wkTag}: ~${Math.round(scheme.pct * 100)}% of bench 1RM `
          + `· ${planPctSets(exId, tier)}×${scheme.range} @ ${load} · RPE ≤ ${cap}`
          + (tier === "D" ? " · deload" : ""),
      sets: planSetsArray(planPctSets(exId, tier), scheme.reps, load),
    };
  }

  // --- Accessories: tier-aware sets/reps, load carried over -----------------
  for (const routineId of Object.keys(PLAN_ACCESSORIES)) {
    if (!out[routineId]) out[routineId] = {};
    for (const acc of PLAN_ACCESSORIES[routineId]) {
      const s = acc[tier];
      const bits = [];
      if (acc.label) bits.push(acc.label);
      bits.push(`${s.sets}×${s.range || s.reps}`);
      if (tier === "D") bits.push(row.block === "Re-express" ? "Re-express week — half sets" : "Deload — half sets, no PRs");
      else bits.push("last set 0–2 RIR");
      out[routineId][acc.id] = {
        note: bits.join(" · "),
        sets: planSetsArray(s.sets, s.reps, ""),
        keepWeight: true,
      };
    }
  }

  return out;
}

// Set counts for the two Wednesday %-based lifts live in the daily template, not
// in PLAN_PCT_LIFTS, so they stay next to the rest of the day's volume.
const PLAN_PCT_SETS = {
  "close-grip-bench-press": {
    "A": 4,
    "B": 4,
    "C": 4,
    "D": 2
  },
  "incline-barbell-bench-press": {
    "A": 3,
    "B": 4,
    "C": 3,
    "D": 2
  }
};
function planPctSets(exId, tier) {
  const row = PLAN_PCT_SETS[exId];
  return row ? row[tier] : 3;
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
