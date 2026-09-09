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
// 14 days (3 light sessions, then the trip), and training resumes SUNDAY
// Aug 16. Every load and the block order are unchanged — only the calendar
// moves. Test day shifts Sun Sep 13 → Sun Sep 20.
//
// 2026-08-16 revision: re-entry pulled forward one day (was Mon Aug 17). Week 11
// is a full 7-day Sun–Sat week again, so the squat + arms double session it used
// to need is unpacked back into the standard Sun/Mon/Wed/Thu/Fri split. Week 12
// onward is untouched.
//
// 2026-08-27 revision: week 12's Wed light-bench/arms got skipped and made up
// with a bonus heavy bench single on Thu instead (315×1 paused, matches the
// 1RM input) — Thu's native squat volume slides to Fri. Week 13 loses Sun
// (birthday) and Tue–Thu (travel): the heavy bench single moves to Fri rather
// than Sat so it isn't back-to-back with week 14's own Sunday bench single;
// Thu's squat volume moves to Sat; Wed's secondary-press/arms is dropped
// (lowest-priority accessory day, and travel leaves no day to fold it into)
// along with Fri's native speed-bench, sacrificed to protect the moved single.
// Only the calendar changes — loads/blocks/weeks are untouched.
//
// 2026-08-29 revision (sheet v3.2 "PRupdate"): week 12 turned into an
// unplanned max four weeks early — SQUAT 500 × 1, comp depth, RPE 9.5 (+22 lb
// lifetime PR over 478) and BENCH 315 × 1 PAUSED / comp-legal (the previous
// 315 was a butt-off grinder, so the bar weight did not move but the
// competition max did). Consequences:
//   • squat 1RM input 478 → 500 — Alex's tested max, not the sheet's 510 e1RM
//     extrapolation. Weeks 13–16 squat loads, the Thursday %-of-1RM volume
//     squat, and the test-day attempts all recalculate off it.
//   • bench 1RM stays 315. The paused single raised the QUALITY of the max,
//     not the number, and its RPE was never recorded. Bench loads unchanged.
//   • weeks 1–12 keep the loads Alex actually trained. The sheet recalculates
//     them as a formula artifact, but they are history here, and rewriting
//     them would make completed sessions read as under-plan against the
//     "logged vs. plan" comparison in recentMainLiftSessions().
//   • the squat goal (470–485) was passed in week 12 → new goal 500–515.
//   • HINGE: the sheet says the back is cleared and programs RDLs; the
//     2026-08-18 injury log lists the lower back as ACTIVE with RDL/deadlift/
//     good-morning/bent-over-row contraindicated. Unresolved, so the Thursday
//     hinge is a HIP THRUST until Alex confirms — same posterior chain, no
//     spinal loading. See rules.hinge.
// Week 13's calendar (birthday Sun, travel Tue–Thu) is confirmed by Alex and
// unchanged.
//
// SUPERSEDES commits af61c64 + e2d7c74 (2026-08-28), which made the same
// 478 → 500 change and landed on the SAME weeks 13–16 squat loads. Two things
// differ, both from the v3.2 sheet Alex supplied on 2026-08-29:
//   • attempts/goals are 465 / 500 / 515 here, not 465 / 490 / 505. The sheet
//     names 515 as the wk-16 third-attempt target and wants the second to be
//     the tested max itself, so the second attempt is 500, not 98% of it.
//   • the hinge swap (RDL → hip thrust) is new, and so is the post-PR note.
// The detail those commits added about WHERE the max happened (Friday of week
// 12, the squat-volume day) is preserved below.
//
// WORKSPACE HAZARD: the local folder is not a git repo and was a commit behind
// alexlynn12/lift-app when this edit started, so uploading it silently reverted
// the 08-28 work. Check the repo's commit history for program-plan.js before
// editing from the local copy.

// 2026-08-29 revision 2: WEEK 13 CONVERTED TO A MINI DELOAD at Alex's request.
// Its original job was to walk the singles up past week 9 — but week 12 already
// blew past every number week 13 was going to ask for (500 squat, 315 paused
// bench), so the only thing left for this week to do is absorb the fatigue from
// an unplanned max. Alex is also away Tue–Thu, so the week is down to Mon/Fri
// (+ an optional Sat) whatever we do. Block Bridge → Deload, rpeCap 8.5 → 6,
// the heavy singles and back-offs are gone, replaced by straight 3×5s.
//
// Loads are a MINI deload, not the program's full one: bench 70% (220) and
// squat 67.5% (340) rather than the 62.5%/62% used in weeks 5 and 10. Week 14
// opens with a 93% bench double and a 91.5% squat single, and dropping to the
// full deload floor makes that a ~30% jump in seven days. RPE ≤ 6 at 70% is
// still a walk — the recovery comes from deleting the singles and halving the
// volume, not from going lighter than that.
// Block order is now: Bridge (11–12) → Deload (13) → Peak (14–15) → Test (16),
// which is the textbook max → deload → peak → taper → test sequence.

// 2026-09-09 revision: week 14's Sun Sep 6 (heavy bench) and Mon Sep 7 (squat
// primary) were both missed. Available days are Wed Sep 9 / Thu Sep 10 /
// Fri Sep 11, so the week is repacked: the 295 bench double goes on Wednesday
// (freshest day to the priority lift, same logic as week 9's Saturday move),
// the 460 squat single on Thursday with Thursday's own volume/posterior/arms
// work merged into it, and Friday keeps its required speed bench. Week 14's
// Wed secondary-press/arms day is DROPPED - lowest-priority slot in a peak week
// and no day left to fold it into. Saturday stays off. Week 15 is untouched:
// openers still open Sun Sep 13, still >=4 days clear of the Sep 20 test.
// Loads, blocks and the 500/315 inputs are all unchanged.
//
// Week 13 actuals, for the record: both required sessions happened but on
// swapped days and over the RPE 6 deload cap. Mon Aug 31 ran the BENCH deload
// (3x5 @ 225 at RPE 7.5/8/8) instead of the prescribed squat deload; Fri Sep 4
// ran squat 2x3 @ 405 @ RPE 8 plus bench 3x3 @ 255/275/275 @ RPE 7.5/8/8.5,
// which is a working session, not a deload. The prescribed 3x5 @ 340 squat
// deload never happened. Four unplanned days off (Sat-Tue) more than absorb the
// overshoot, so peak week opens on schedule rather than dialed back.

// 2026-09-09, second revision: week 14 dialed back to a RE-ENTRY week at Alex's
// request. Training history behind the call: week 13 carried five non-training
// days (birthday + travel), and Fri Sep 4 was followed by five more straight off
// (Sat Sep 5 - Wed Sep 9). Two sessions in eleven days, and the last heavy single
// on either lift is Aug 27/28. Opening a peak week with a 93% bench double and a
// 91.5% squat single off that is asking a rusty groove to hold a near-max, which
// is how a taper turns into a grinder.
//
// Top singles cut 295 -> 275 (93% -> 87.5%) and 460 -> 435 (91.5% -> 87%), RPE
// cap 9 -> 8, back-offs 250 -> 245 and 390 -> 375. Each carries an earn-it
// clause: RPE <= 7.5 on the top single buys ONE more (bench 285, squat 450) and
// nothing beyond it. Volume stays -50% and accessories -60%; this is a lighter
// peak week, not a second deload, and the week-11 re-entry precedent is the
// model (cap the top set, own the back-offs, let bar speed gate the load).
//
// WEEK 15 AND 16 ARE UNCHANGED. The Sun Sep 13 bench opener and Mon Sep 14 squat
// opener become the first 93% exposures of the cycle and are now the rehearsal
// that matters - still >=4 days clear of the Sep 20 test, which is the taper
// requirement. The cost of this change is real and worth naming: the buffer is
// spent. Week 15's light days have to stay light, and there is no room left to
// absorb another missed block before test day. If Alex would rather have a full
// re-entry week AND a full peak week, the fix is moving the test to Sep 27 -
// strength residuals hold well past a week - not compressing both into eleven days.

const PROGRAM_PLAN_VERSION = 7;

const PROGRAM_PLAN = {
  name: "Powerlifting v3.1 — Max Strength",
  totalWeeks: 16,
  // Sunday of week 1. Week 9 opens Sat Jul 25 2026 per the vacation-adjusted
  // sheet, which anchors week 1 to May 31 2026.
  defaultStartDate: "2026-05-31",
  // 2026-08-29: squat 478 → 500 (tested, RPE 9.5, week 12). Bench held at 315 —
  // the paused single re-qualified the max rather than raising it.
  oneRm: { bench: 315, squat: 500 },
  goals: {
    bench: { lo: 322.5, hi: 328 },
    // Original 470–485 was cleared in week 12. New job: hold 500, earn 515.
    squat: { lo: 500, hi: 515 },
  },
  // Test-day attempt plan (week 16): opener / second / third (earned PR).
  attemptPlan: {
    bench: [295, 312.5, 322.5],
    squat: [465, 500, 515],
  },
  // Weekly direct-set targets (guaranteed Sun/Wed/Thu; Fri is bonus only).
  armSets: { biceps: [14, 16], triceps: [12, 14] },
  rules: {
    progression: "Add load only when the top set is at or under the RPE cap. The cap beats the % ladder: if last week's top set exceeded it, repeat that load.",
    autoDrop: "Elbow ache OR Wed pressing RPE +1 over target → skip Fri (wks 1–10) or drop Fri pump work only (wks 11–15, keep 4×3 speed bench).",
    fatigue: "2 sessions in a row over target RPE → pull the week's loads 5%.",
    benchStandard: "Every comp-bench top set is PAUSED (comp command).",
    vacation: "The Aug 6–14 trip REPLACES the week-10 gym deload — don't do both. Three light sessions (Aug 2/3/5), then the trip is the rest.",
    miniDeload: "Week 13 is a mini deload (2026-08-29). No singles, no back-offs, no PRs: 3×5 at RPE ≤ 6, half the accessory sets. It is not a week to make up missed work in — the point is to walk into peak week fresh, and the travel is doing half the job already.",
    postPr: "Week 12 was an unplanned max four weeks early (500 squat @ RPE 9.5, 315 paused bench). Bank the numbers, then respect the fatigue: if the back or hips flagged during it or the morning after, run week 13 at RPE ≤ 7 and do not chase another heavy single.",
    hinge: "UNRESOLVED (2026-08-29): this program says the back is cleared and prescribes RDLs; the 2026-08-18 injury log lists the lower back as ACTIVE with RDL, deadlift, good morning and bent-over row contraindicated. Until that is settled the Thursday hinge is a HIP THRUST — same posterior chain, no spinal loading. Swap it back only after confirming the back is clear.",
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
    { week: 10, block: "Deload",      rpeCap: 6,   bench: { sets: 3, reps: 5, pct: 62.5, load: 195 }, benchBO: null,                                  squat: { sets: 3, reps: 5, pct: 62,   load: 295 }, squatBO: null,                                  note: "Deload = your vacation. Three light sessions (Aug 2/3/5) at 50% accessory sets, then off Aug 6–15. Don't do a gym deload AND 10 days off — the trip is the rest." },
    { week: 11, block: "Bridge",      rpeCap: 7.5, bench: { sets: 1, reps: 1, pct: 88,   load: 275 }, benchBO: { sets: 3, reps: 5, pct: 75, load: 235 }, squat: { sets: 1, reps: 2, pct: 86,   load: 410 }, squatBO: { sets: 3, reps: 5, pct: 74, load: 355 }, note: "RE-ENTRY week — resume Sun Aug 16 after ~10 days off. Cap every top set at RPE 7.5. Own the back-offs; lighten or skip the heavy single until bar speed returns. Roll into wk-12 loads only if the singles felt normal — otherwise repeat this week." },
    { week: 12, block: "Bridge",      rpeCap: 8,   bench: { sets: 1, reps: 1, pct: 90,   load: 285 }, benchBO: { sets: 3, reps: 5, pct: 76, load: 240 }, squat: { sets: 1, reps: 2, pct: 88,   load: 420 }, squatBO: { sets: 3, reps: 5, pct: 75, load: 360 }, note: "ACTUAL: bench 315 × 1 PAUSED (prescribed single was 285) and squat 500 × 1 @ RPE 9.5 (prescribed 1×2 @ 420). Both far over block spec — an unplanned max test four weeks early. Squat 1RM input updated 478 → 500; bench held at 315. Loads below are what was prescribed, kept as history." },
    { week: 13, block: "Deload",      rpeCap: 6,   bench: { sets: 3, reps: 5, pct: 70,   load: 220 }, benchBO: null,                                  squat: { sets: 3, reps: 5, pct: 67.5, load: 340 }, squatBO: null,                                  note: "MINI DELOAD (was a Bridge week). Week 12 was an unplanned max — 500 squat at RPE 9.5 and a paused 315 bench — which already beat every number this week was going to ask for, so there is nothing left to build and plenty to recover from. Heavy singles and back-offs are deleted: 3×5 at RPE ≤ 6, half the accessory sets, no PRs. Loads sit above the usual deload floor (70% / 67.5% rather than 62.5% / 62%) because peak week opens with a 93% bench and a 91.5% squat single and you should not walk into that flat. Away Tue–Thu, so the week is Mon and Fri with Saturday optional." },
    { week: 14, block: "Peak",        rpeCap: 8,   bench: { sets: 1, reps: 1, pct: 87.5, load: 275 }, benchBO: { sets: 2, reps: 3, pct: 78, load: 245 }, squat: { sets: 1, reps: 1, pct: 87,   load: 435 }, squatBO: { sets: 2, reps: 3, pct: 75, load: 375 }, note: "RE-ENTRY — dialed back from 295/460 @ RPE 9. Two training days in the last eleven and five straight off before today, so this week rehearses the heavy single instead of contesting it: one crisp single per lift at RPE ≤ 8, back-offs owned, volume still −50% and accessories −60%. Earn-it clause: if the top single moves at RPE ≤ 7.5, take ONE more — bench 285, squat 450 — and stop there. Week 15 openers are unchanged and become the first 93% exposure; that is the rehearsal that matters, ≥4 days clear of the test. Saturday off." },
    { week: 15, block: "Peak",        rpeCap: 9,   bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: { sets: 2, reps: 2, pct: 75, load: 235 }, squat: { sets: 1, reps: 1, pct: 93,   load: 465 }, squatBO: { sets: 2, reps: 2, pct: 72, load: 360 }, note: "Volume −70%. Openers early in the week (≥4 days before test), then Friday is REST. Carb-load the final 3 days. Sleep is programming." },
    { week: 16, block: "Test",        rpeCap: 10,  bench: { sets: 1, reps: 1, pct: 93,   load: 295 }, benchBO: null,                                  squat: { sets: 1, reps: 1, pct: 93,   load: 465 }, squatBO: null,                                  note: "TEST — Sun Sep 20. Squat first, then bench (meet order). Full rest 5–8 min between attempts. Third attempts are earned: take the PR only if the second moved at ≤ RPE 9." },
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
  // Week 10 = the deload AND the trip. 14 days (Aug 2–15).
  {
    week: 10, offset: 63, length: 14,
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
      { d: 13, id: null,                            label: "Travel home",        kind: "off",    required: false, note: "~10 days off costs an advanced lifter no strength — it holds 2–3 weeks. You come back rusty, not weaker. Training resumes tomorrow." },
    ],
  },
  // Week 11 = re-entry, Sun Aug 16 – Sat Aug 22 (7 days). Back on the standard
  // split — the full week means the squat + arms double session is no longer
  // needed, which is the right call coming off ~10 days away.
  {
    week: 11, offset: 77, length: 7,
    label: "Re-entry — resume Sun Aug 16",
    days: [
      { d: 0, id: "seed-sun-heavy-bench",                 label: "Re-entry Bench",           kind: "train", required: true,  note: "First session back. Hit the 3×5 @ 75% ≈ 235 back-offs; lighten or skip the 88% single until bar speed returns." },
      { d: 1, id: "seed-mon-squat-primary",               label: "Squat Primary",            kind: "train", required: true,  note: "Squat re-entry: back-offs 3×5 @ 74% ≈ 355, ease the 86% single. Everything capped at RPE 7.5 this week." },
      { d: 2, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
      { d: 3, id: "seed-wed-secondary-press-arms",        label: "Secondary Press + Arms",   kind: "train", required: true,  note: "Back in its own slot — no doubling up this week." },
      { d: 4, id: "seed-thu-squat-volume-posterior-arms", label: "Squat Volume + Posterior", kind: "train", required: true,  note: "Everything capped at RPE 7.5 this week. RDLs at RPE ≤ 7." },
      { d: 5, id: "seed-fri-speed-bench-pump",            label: "Speed Bench (REQUIRED)",   kind: "train", required: true,  note: "4×3 @ 72% — speed bench is required from here to week 15. Drop pump work first, never the bar work." },
      { d: 6, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
    ],
  },
  // Week 12: Wed light-bench/arms skipped, made up with a bonus heavy bench
  // single Thu instead — Thu's native squat volume slides to Fri.
  {
    week: 12, offset: 84, length: 7,
    label: "Wed skipped — bonus bench single Thu instead",
    days: [
      { d: 0, id: "seed-sun-heavy-bench",                 label: "Heavy Bench",             kind: "train", required: true },
      { d: 1, id: "seed-mon-squat-primary",               label: "Squat Primary",           kind: "train", required: true },
      { d: 2, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
      { d: 3, id: null,                                   label: "Skipped",                  kind: "rest",  required: false, note: "Secondary Press + Arms skipped — replaced by Thu's unplanned heavy single." },
      { d: 4, id: "seed-sun-heavy-bench",                 label: "Heavy Bench Single (bonus)", kind: "train", required: true,  note: "Unplanned 315×1 paused single — matches the 1RM input. Done in place of the skipped Wed light-bench/arms day. Thu's native squat volume moves to Fri." },
      { d: 5, id: "seed-fri-speed-bench-pump", extraId: "seed-thu-squat-volume-posterior-arms", label: "Squat Volume + Speed Bench", kind: "train", required: true, note: "Thu's squat volume folded in here since Thu became the bonus bench single — and it turned into the unplanned 500 × 1 @ RPE 9.5 that reset the squat 1RM. Speed bench still done as planned." },
      { d: 6, id: null,                                   label: "Rest",                     kind: "rest",  required: false },
    ],
  },
  // Week 13: Sun off for birthday, Tue–Thu off for travel. Bench single moves
  // to Fri (not Sat — Sat-into-Sun-14 would stack two heavy bench singles back
  // to back with zero rest). Squat volume moves to Sat. Wed's secondary
  // press/arms and Fri's native speed-bench are the two things that don't fit
  // and get dropped — lowest-priority accessory/bonus work, not a main lift.
  {
    week: 13, offset: 91, length: 7,
    label: "Mini deload — birthday Sun, travel Tue–Thu",
    days: [
      { d: 0, id: null,                                   label: "Birthday — off",           kind: "off",    required: false, note: "Happy birthday. The heavy bench single that was moved here is cancelled outright — this is a deload week now, and week 12's paused 315 already banked what that single was for." },
      { d: 1, id: "seed-mon-squat-primary",               label: "Deload Squat",             kind: "train", required: true,  note: "ACTUAL: not run — Mon Aug 31 did the BENCH deload instead (3×5 @ 225, RPE 7.5/8/8). The prescribed 3×5 @ 340 squat deload never happened; Fri got squat 2×3 @ 405 @ RPE 8 instead. Planned was 3×5 @ 340, RPE ≤ 6. Crisp and fast off the floor — if a rep feels like work, you are too heavy. No singles, no back-offs, half the accessory sets." },
      { d: 2, id: null,                                   label: "Travel",                   kind: "travel", required: false },
      { d: 3, id: null,                                   label: "Travel",                   kind: "travel", required: false, note: "Secondary Press + Arms is off this week. On a deload that is a feature — arm volume picks back up in week 14." },
      { d: 4, id: null,                                   label: "Travel",                   kind: "travel", required: false },
      { d: 5, id: "seed-sun-heavy-bench",                 label: "Deload Bench",             kind: "train", required: true, note: "ACTUAL: the bench deload was run on Mon Aug 31 (3×5 @ 225, RPE 7.5/8/8 — a point and a half over the cap). Fri Sep 4 instead ran squat 2×3 @ 405 @ RPE 8 and bench 3×3 @ 255/275/275 @ RPE 7.5/8/8.5. Planned was 3×5 @ 220, PAUSED, RPE ≤ 6. The heavy single is cancelled — keep the comp command and the bar speed, drop the strain. This is the last bench before peak week's 295 double." },
      { d: 6, id: "seed-thu-squat-volume-posterior-arms", label: "Light Squat + Posterior (optional)", kind: "train", required: false, note: "OPTIONAL. Take it only if the travel left you feeling good — peak week opens tomorrow with a 460 squat single. Everything light, RPE ≤ 6, and the hinge is a HIP THRUST, not an RDL, until the back status is confirmed." },
    ],
  },
  // Week 14: Sun (heavy bench) and Mon (squat primary) both missed. Repacked
  // onto Wed/Thu/Fri; Wed's secondary press + arms is the day that gets dropped.
  {
    week: 14, offset: 98, length: 7,
    label: "Missed Sun + Mon \u2014 repacked onto Wed/Thu/Fri",
    days: [
      { d: 0, id: null, label: "Missed \u2014 heavy bench", kind: "off", required: false, note: "Skipped (busy). Moved to Wed." },
      { d: 1, id: null, label: "Missed \u2014 squat primary", kind: "off", required: false, note: "Skipped (busy). Moved to Thu." },
      { d: 2, id: null, label: "Rest", kind: "rest", required: false, note: "Fifth straight day off since Fri Sep 4, on top of five days off inside week 13 \u2014 two training days in eleven. That is why week 14 is re-entry loading rather than peak loading." },
      { d: 3, id: "seed-sun-heavy-bench", label: "Heavy Bench (moved from Sun)", kind: "train", required: true, note: "275\u00d71 PAUSED at RPE cap 8, then 2\u00d73 @ 245. Dialed back from 295 \u2014 this is a re-entry single, not a contest. If 275 moves at RPE \u2264 7.5, take ONE more at 285 and stop; if it reads 8.5+, you learned something useful and Sunday's opener comes down. Log the RPE either way. At 275 it is a rustiness check, not a 1RM test \u2014 the bench-1RM question (315 vs 322.5 vs 330) now gets settled by Sunday's opener single, which is the better instrument anyway because it is the actual rehearsal. What today tells you: RPE \u2264 7.5 means the layoff cost nothing and Sunday runs at full opener; RPE 8.5+ means take Sunday at 290 and let the platform sort out the third attempt. Accessories \u221260%: chest-supported row 3\u00d76\u20138, behind-body cable curl 3\u00d710, pushdown 2\u00d78\u201310, face pull 2\u00d715. Drop the Larsen/Spoto work." },
      { d: 4, id: "seed-mon-squat-primary", extraId: "seed-thu-squat-volume-posterior-arms", label: "Squat Single + Posterior/Arms (merged)", kind: "train", required: true, note: "435\u00d71 at RPE cap 8, then 2\u00d73 @ 375. Dialed back from 460. Sep 4's 405\u00d73 @ RPE 8 is the only recent reference and the wk-13 deload squat never ran, so 435 is a half-step rather than a full one. Earn-it clause: RPE \u2264 7.5 on 435 buys ONE single at 450, then stop. Monday's 465 opener is unchanged. Thursday's own day is merged in at peak size: leg press 2\u00d78, hip thrust 2\u00d76 @ RPE \u22647, leg curl 3\u00d710, preacher/spider 2\u00d710, reverse EZ 2\u00d712, anti-flexion core. Hinge stays the HIP THRUST \u2014 no RDLs until the back status is confirmed." },
      { d: 5, id: "seed-fri-speed-bench-pump", label: "Speed Bench + Pump", kind: "train", required: true, note: "4\u00d73 @ 225 (72%), <1s pause, move fast \u2014 bar speed, not stimulus, and it means 225. Sep 4's 'speed' bench ran 255/275/275 to RPE 8.5, which is a heavy triple wearing a speed day's name; two days out from an opener that only takes. Keep the session under 40 min. Pump work is the first thing to cut if anything aches." },
      { d: 6, id: null, label: "Rest", kind: "rest", required: false, note: "Saturday off as designed. Sunday opens week 15 on schedule." },
    ],
  },
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

// Deload scaling for the variations priced as a % of the CYCLE 1RM (cgbp,
// incline, thuSquat). The `off`-based variations (larsen, pauseMon) key off the
// day's comp load and therefore deload themselves; the pct-based ones do not,
// and without this they came out HEAVIER than the deload comp lift they sit
// beside — Thursday's 73%-of-1RM volume squat was 365 next to a 340 comp
// squat. 0.85 lands each of them at roughly the deload comp percentage
// (0.73 × 0.85 ≈ 62%, which is exactly the program's own deload squat).
const PLAN_DELOAD_PCT_SCALE = 0.85;

function planVariationScheme(kind, block) {
  const scheme = PLAN_VARIATIONS[kind][planBlockKey(block)];
  if (!scheme) return null;
  if (block === "Deload") {
    // 50% accessory sets on deload weeks, same rep targets, and the %-of-1RM
    // loads pulled down so they sit under the deload comp lift.
    const out = { ...scheme, sets: Math.max(1, Math.ceil(scheme.sets / 2)) };
    if (typeof out.pct === "number") out.pct = out.pct * PLAN_DELOAD_PCT_SCALE;
    return out;
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
    // 2026-08-29: RDL → hip thrust while the lower-back status is unresolved
    // (see rules.hinge). Same posterior chain, no spinal loading. Swap back to
    // "romanian-deadlift" once the back is confirmed clear.
    { id: "hip-thrust",                 label: "Hinge — RPE ≤ 7, never a max (RDL substitute)", Hypertrophy: { sets: 3, reps: 8,  range: "8" },     Strength: { sets: 3, reps: 6,  range: "6" },    Bridge: { sets: 3, reps: 6,  range: "6" },     Peak: null, Test: null },
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
