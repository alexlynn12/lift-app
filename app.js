/* Just Lift — personal workout tracker. Vanilla JS, no build step. */

(() => {
  "use strict";

  // ---------- Global state ----------
  const state = {
    settings: {
      unitMode: "both", activeUnit: "lb", hapticsEnabled: true, bodyWeightLb: null, heightIn: null,
      // Plate calculator: bar weight + the plates (per side, one of each pair)
      // available in the gym, largest first. Stored in lb (canonical unit).
      barWeightLb: 45,
      platesLb: [45, 35, 25, 10, 5, 2.5],
      // Optional per-set RPE column (off by default, like Strong/Hevy).
      showRpe: false,
      // Optional rest timer between sets (off by default — deliberately, so
      // the minimalist flow is unchanged unless the person opts in).
      restTimerEnabled: false,
      restTimerSec: 120,
      // Dated bodyweight log [{date, lb}] powering the trend chart and the
      // bodyweight-exercise effort scoring. bodyWeightLb mirrors the latest.
      bodyWeightLog: [],
    },
    customExercises: [],
    routines: [],
    workouts: [],
    // Set shape: {weight, reps, completed, isWarmup?, rpe?, type?}  type ∈ "drop"|"failure"
    // Exercise shape may carry supersetId to group it with adjacent exercises.
    activeWorkout: null,
    // Cardio/other non-strength sessions — see ACTIVITY_TYPES below. Record
    // shape: {id, activityType, name, date, durationSec, distance?, notes?,
    // rpe, effortScore, prCount:0}. Kept in a separate array/store from
    // state.workouts (which many existing functions assume has .exercises)
    // rather than merged in; see allSessions()/isCardioSession().
    activities: [],
    activeCardio: null,
    // Data-URL profile photo (if the person uploaded one), kept outside
    // `settings` so it doesn't bloat that blob on every settings save.
    profilePhoto: null,
  };


  const appEl = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const confirmOverlayEl = document.getElementById("confirm-overlay");
  const confirmTitleEl = document.getElementById("confirm-title");
  const confirmMessageEl = document.getElementById("confirm-message");
  const confirmCancelBtn = document.getElementById("confirm-cancel");
  const confirmOkBtn = document.getElementById("confirm-ok");
  let confirmResolve = null;

  // Styled stand-in for window.confirm() — native browser dialogs look out
  // of place inside an installed app. Returns a Promise<boolean>.
  function showConfirm(message, opts = {}) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmTitleEl.textContent = opts.title || "Are you sure?";
      confirmMessageEl.textContent = message;
      confirmOkBtn.textContent = opts.okLabel || "Confirm";
      confirmCancelBtn.textContent = opts.cancelLabel || "Cancel";
      confirmOkBtn.classList.toggle("danger", !!opts.danger);
      confirmOverlayEl.classList.remove("hidden");
      requestAnimationFrame(() => confirmOverlayEl.classList.add("open"));
    });
  }

  function closeConfirm(result) {
    confirmOverlayEl.classList.remove("open");
    setTimeout(() => confirmOverlayEl.classList.add("hidden"), 180);
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
  }

  confirmCancelBtn.addEventListener("click", () => { tapFeedback(confirmCancelBtn); closeConfirm(false); });
  confirmOkBtn.addEventListener("click", () => { tapFeedback(confirmOkBtn); closeConfirm(true); });

  // ---------- Generic info sheet ----------
  // The shared "tap a box, see the numbers behind it" surface used by the
  // Home hero card, Analytics' training-load/muscle-stimulus rows, and the
  // History calendar's day-detail. Reuses the .confirm-overlay/.confirm-card
  // classes (not a bespoke one-off) so it gets drag-to-dismiss for free from
  // initSheetDrag(".confirm-overlay", ...) below.
  const infoSheetOverlayEl = document.getElementById("info-sheet-overlay");
  const infoSheetTitleEl = document.getElementById("info-sheet-title");
  const infoSheetBodyEl = document.getElementById("info-sheet-body");
  const infoSheetCloseBtn = document.getElementById("info-sheet-close");

  function openInfoSheet(title, bodyHtml) {
    infoSheetTitleEl.textContent = title;
    infoSheetBodyEl.innerHTML = bodyHtml;
    infoSheetOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => infoSheetOverlayEl.classList.add("open"));
  }
  function closeInfoSheet() {
    infoSheetOverlayEl.classList.remove("open");
    setTimeout(() => infoSheetOverlayEl.classList.add("hidden"), 180);
  }
  infoSheetCloseBtn.addEventListener("click", () => { tapFeedback(infoSheetCloseBtn); closeInfoSheet(); });
  // A sheet can carry its own [data-nav-route] links (e.g. "jump to this
  // workout" inside a calendar day's session list) — info-sheet-body lives
  // outside #app, so it needs its own delegated listener rather than
  // riding onAppClick's.
  infoSheetBodyEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-nav-route]");
    if (!t) return;
    tapFeedback(t);
    closeInfoSheet();
    navigate(t.dataset.navRoute, t.dataset.navId ? { id: t.dataset.navId } : undefined);
  });

  // ---------- Profile button / start FAB / activity picker ----------
  // Chrome fixed outside #app (see index.html), so these need their own
  // listeners rather than riding onAppClick's #app-scoped delegation.
  document.getElementById("profile-btn").addEventListener("click", (e) => {
    tapFeedback(e.currentTarget);
    navigate("profile");
  });

  const startActivitySheetEl = document.getElementById("start-activity-sheet");
  const startActivityActionsEl = document.getElementById("start-activity-actions");
  const startActivityCloseBtn = document.getElementById("start-activity-close");

  function openStartActivitySheet() {
    startActivitySheetEl.classList.remove("hidden");
    requestAnimationFrame(() => startActivitySheetEl.classList.add("open"));
  }
  function closeStartActivitySheet() {
    startActivitySheetEl.classList.remove("open");
    setTimeout(() => startActivitySheetEl.classList.add("hidden"), 180);
  }
  document.getElementById("fab-start").addEventListener("click", (e) => { tapFeedback(e.currentTarget, "primary"); openStartActivitySheet(); });
  startActivityCloseBtn.addEventListener("click", () => { tapFeedback(startActivityCloseBtn); closeStartActivitySheet(); });
  startActivityActionsEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-start]");
    if (!t) return;
    tapFeedback(t);
    const kind = t.dataset.start;
    closeStartActivitySheet();
    if (kind === "strength") startWorkout(null);
    else startCardioActivity(kind);
  });

  // ---------- Per-exercise "..." options menu (routine editor) ----------
  // Lets a routine exercise carry a free-text note (RPE, rep range, tempo,
  // etc.) and lets the person insert a warmup set, without cluttering the
  // main routine-edit screen with extra buttons.
  const exerciseMenuOverlayEl = document.getElementById("exercise-menu-overlay");
  const exerciseMenuActionsEl = document.getElementById("exercise-menu-actions");
  const menuNoteFormEl = document.getElementById("menu-note-form");
  const menuNoteInputEl = document.getElementById("menu-note-input");
  const menuNoteSaveBtn = document.getElementById("menu-note-save");
  const exerciseMenuCloseBtn = document.getElementById("exercise-menu-close");
  let exerciseMenuIndex = null;
  let exerciseMenuContext = "routine"; // "routine" (editing a draft) | "workout" (an in-progress workout)

  // Resolves the exercise object the open menu applies to, plus how to
  // persist a change to it — a routine draft only needs to be saved when
  // the person taps the screen's own Save button, while an in-progress
  // workout should persist immediately so nothing is lost if the app closes.
  function getExerciseMenuTarget() {
    if (exerciseMenuIndex == null) return null;
    if (exerciseMenuContext === "workout") {
      const w = state.activeWorkout;
      const ex = w && w.exercises[exerciseMenuIndex];
      return ex ? { ex, persist: () => saveActiveWorkout() } : null;
    }
    const draft = renderRoutineEdit._draft;
    const re = draft && draft.exercises[exerciseMenuIndex];
    return re ? { ex: re, persist: () => {} } : null;
  }

  function openExerciseMenu(index, context = "routine") {
    exerciseMenuIndex = index;
    exerciseMenuContext = context;
    exerciseMenuActionsEl.classList.remove("hidden");
    menuNoteFormEl.classList.add("hidden");
    // Superset + warm-up ramp only apply to an in-progress workout, not a
    // routine template.
    exerciseMenuOverlayEl.querySelectorAll(".menu-item-workout-only").forEach((el) => {
      el.style.display = context === "workout" ? "" : "none";
    });
    exerciseMenuOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => exerciseMenuOverlayEl.classList.add("open"));
  }

  function closeExerciseMenu() {
    exerciseMenuOverlayEl.classList.remove("open");
    setTimeout(() => exerciseMenuOverlayEl.classList.add("hidden"), 180);
    exerciseMenuIndex = null;
  }

  exerciseMenuCloseBtn.addEventListener("click", () => { tapFeedback(exerciseMenuCloseBtn); closeExerciseMenu(); });

  exerciseMenuActionsEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    tapFeedback(t);
    const target = getExerciseMenuTarget();
    if (!target) { closeExerciseMenu(); return; }
    const { ex, persist } = target;
    if (t.dataset.action === "menu-add-note") {
      menuNoteInputEl.value = ex.note || "";
      exerciseMenuActionsEl.classList.add("hidden");
      menuNoteFormEl.classList.remove("hidden");
      menuNoteInputEl.focus();
    } else if (t.dataset.action === "menu-add-warmup") {
      const warmupSet = exerciseMenuContext === "workout"
        ? { weight: "", reps: "", completed: false, isWarmup: true }
        : { weight: "", reps: "", isWarmup: true };
      ex.sets.unshift(warmupSet);
      persist();
      closeExerciseMenu();
      render();
    } else if (t.dataset.action === "menu-add-ramp") {
      const idx = exerciseMenuIndex;
      closeExerciseMenu();
      addWarmupRamp(idx);
    } else if (t.dataset.action === "menu-superset") {
      const idx = exerciseMenuIndex;
      closeExerciseMenu();
      toggleSupersetWithNext(idx);
    } else if (t.dataset.action === "menu-replace") {
      const idx = exerciseMenuIndex;
      closeExerciseMenu();
      openReplaceExercisePicker(idx);
    } else if (t.dataset.action === "menu-remove") {
      // Removal lives here (not as an always-visible red button on every
      // exercise card) so the workout screen stays calm and a stray tap
      // can't wipe an exercise mid-session.
      const idx = exerciseMenuIndex;
      const ctx = exerciseMenuContext;
      closeExerciseMenu();
      if (ctx === "workout" && state.activeWorkout) {
        state.activeWorkout.exercises.splice(idx, 1);
        saveActiveWorkout();
      } else if (renderRoutineEdit._draft) {
        renderRoutineEdit._draft.exercises.splice(idx, 1);
      }
      render();
    }
  });

  menuNoteSaveBtn.addEventListener("click", () => {
    tapFeedback(menuNoteSaveBtn, "primary");
    const target = getExerciseMenuTarget();
    if (target) {
      target.ex.note = menuNoteInputEl.value.trim();
      target.persist();
    }
    closeExerciseMenu();
    render();
  });

  // iOS Safari only applies :active CSS states to elements when the page
  // has a touch listener somewhere — this no-op listener is the standard
  // workaround, and is what makes the tap-press visual feedback below
  // actually show up on iPhone (where navigator.vibrate is unavailable).
  document.addEventListener("touchstart", function () {}, { passive: true });

  // ---------- Utilities ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function lbToKg(lb) { return lb * 0.453592; }
  function kgToLb(kg) { return kg / 0.453592; }

  function displayUnit() {
    return state.settings.unitMode === "both" ? state.settings.activeUnit : state.settings.unitMode;
  }

  function weightToDisplay(weightLb) {
    if (weightLb == null || weightLb === "") return "";
    const u = displayUnit();
    const v = u === "kg" ? lbToKg(weightLb) : weightLb;
    return roundClean(v);
  }

  function weightFromDisplay(value) {
    const u = displayUnit();
    const n = parseFloat(value);
    if (isNaN(n)) return 0;
    return u === "kg" ? kgToLb(n) : n;
  }

  // Height is stored internally in inches (same "pick one canonical unit"
  // pattern as weight-in-lb), and reuses the existing lb/kg toggle to
  // decide whether to display inches or centimeters — one unit preference
  // for the whole app rather than a second, separate toggle.
  function inToCm(inches) { return inches * 2.54; }
  function cmToIn(cm) { return cm / 2.54; }
  function heightUnitLabel() { return displayUnit() === "kg" ? "cm" : "in"; }

  function heightToDisplay(heightIn) {
    if (heightIn == null || heightIn === "") return "";
    const v = displayUnit() === "kg" ? inToCm(heightIn) : heightIn;
    return roundClean(v);
  }

  function heightFromDisplay(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    return displayUnit() === "kg" ? cmToIn(n) : n;
  }

  function roundClean(n) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? r : r.toFixed(1);
  }

  function unitLabel() { return displayUnit(); }

  function fmtTime(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    }
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function fmtDuration(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem}m`;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("visible"), 1800);
  }

  function allExercises() {
    return [...DEFAULT_EXERCISES, ...state.customExercises];
  }

  function exerciseById(id) {
    return allExercises().find((e) => e.id === id);
  }

  // ---------- Persistence ----------
  async function loadAll() {
    const [settings, customExercises, routines, workouts, activeWorkout, activities, activeCardio, profilePhoto] = await Promise.all([
      DB.kvGet("settings", null),
      DB.getAll("exercises"),
      DB.getAll("routines"),
      DB.getAll("workouts"),
      DB.kvGet("activeWorkout", null),
      DB.getAll("activities"),
      DB.kvGet("activeCardio", null),
      DB.kvGet("profilePhoto", null),
    ]);
    // Merge (not replace) so new setting fields added after someone's first
    // install — like bodyWeightLb — still get their default instead of
    // coming back undefined for existing saved settings blobs.
    if (settings) state.settings = { ...state.settings, ...settings };
    // Migrate the old single static bodyweight into the dated log so existing
    // installs get a first data point instead of an empty trend.
    if (!Array.isArray(state.settings.bodyWeightLog)) state.settings.bodyWeightLog = [];
    if (state.settings.bodyWeightLog.length === 0 && state.settings.bodyWeightLb) {
      state.settings.bodyWeightLog = [{ date: new Date().toISOString(), lb: state.settings.bodyWeightLb }];
    }
    state.customExercises = customExercises || [];
    state.routines = routines || [];
    await removeLegacyProgram();
    state.workouts = (workouts || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activeWorkout = activeWorkout;
    state.activities = (activities || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activeCardio = activeCardio;
    state.profilePhoto = profilePhoto;

    await backfillEffortScores();

  }

  // The 16-week program (program-plan.js / program-seed.js) was retired on
  // 2026-10-19 in favour of auto-suggested weekly workouts (see
  // suggestedWeek()). One-time cleanup: drop the plan's seed-* routines and
  // its settings. Workout history, PRs and the user's own routines are kept.
  async function removeLegacyProgram() {
    if (await DB.kvGet("legacyProgramRemoved", false)) return;
    const seeds = state.routines.filter((r) => String(r.id).startsWith("seed-"));
    await Promise.all(seeds.map((r) => DB.delete("routines", r.id)));
    state.routines = state.routines.filter((r) => !String(r.id).startsWith("seed-"));
    delete state.settings.programStartDate;
    delete state.settings.programAdjustments;
    await DB.kvSet("settings", state.settings);
    await DB.kvSet("legacyProgramRemoved", true);
  }

  function saveSettings() { DB.kvSet("settings", state.settings); }
  function saveActiveWorkout() { DB.kvSet("activeWorkout", state.activeWorkout); }

  // ---------- Router ----------
  function parseHash() {
    const raw = location.hash.slice(1) || "home";
    const [route, qs] = raw.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    return { route, params };
  }

  function navigate(route, params) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    location.hash = route + qs;
  }

  window.addEventListener("hashchange", render);

  // ---------- Haptics ----------
  // Vibration API is Android-only — iOS Safari (including installed PWAs)
  // has no web API for the Taptic Engine, so this silently no-ops there.
  function vibrateTap() {
    if (state.settings.hapticsEnabled !== false && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  // ---------- Tap sounds ----------
  // One shared AudioContext, reused for every tap — creating a fresh one
  // per click would be wasteful for something that fires on every button
  // press. Kept lazy since AudioContext can't be created before a user
  // gesture on most browsers anyway.
  let tapAudioCtx = null;
  function getTapAudioCtx() {
    if (!tapAudioCtx) {
      try { tapAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (tapAudioCtx.state === "suspended") tapAudioCtx.resume().catch(() => {});
    return tapAudioCtx;
  }

  // A short, soft synthesized tone — a downward pitch glide reads as a
  // gentle "thock" rather than a harsh click. Kept quiet (peak gains below)
  // since this fires on nearly every tap.
  function playTone(freqStart, freqEnd, duration, peakGain, type) {
    const ctx = getTapAudioCtx();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freqStart, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + duration + 0.02);
    } catch (e) { /* audio unavailable */ }
  }

  // A handful of distinct-but-related "voices" so different kinds of
  // actions feel different without any one of them standing out: primary/
  // confirming actions get a rounder, slightly warmer thock; destructive
  // actions get a lower, duller thud (weightier, not alarming); toggles and
  // tab switches get a light, brief tick; everything else gets a small
  // neutral click.
  function playTapSound(kind) {
    if (state.settings.soundEnabled === false) return;
    switch (kind) {
      case "primary": playTone(620, 380, 0.075, 0.16, "sine"); break;
      case "danger": playTone(260, 170, 0.09, 0.15, "triangle"); break;
      case "toggle": playTone(1500, 1300, 0.032, 0.09, "sine"); break;
      default: playTone(950, 700, 0.045, 0.11, "sine"); break;
    }
  }

  // Classifies a clicked element into one of the voices above, based on
  // the same CSS classes already used for visual styling — no separate
  // bookkeeping needed per button.
  function classifyTapSound(el) {
    if (!el) return "default";
    if (el.classList.contains("btn-danger") || el.classList.contains("icon-btn-danger") || el.classList.contains("danger")) return "danger";
    if (el.classList.contains("btn-primary") || el.classList.contains("btn-accent")) return "primary";
    if (el.classList.contains("tab") || el.closest(".segmented")) return "toggle";
    return "default";
  }

  function tapFeedback(el, kindOverride) {
    vibrateTap();
    playTapSound(kindOverride || classifyTapSound(el));
  }


  // ---------- Set / workout helpers ----------
  function lastCompletedWorkoutFor(exerciseId, excludeWorkoutId) {
    for (const w of state.workouts) {
      if (w.id === excludeWorkoutId) continue;
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (ex && ex.sets.some((s) => s.completed)) return { workout: w, exercise: ex };
    }
    return null;
  }

  // `setIndex` here is the index among *working* (non-warmup) sets only, so
  // warmup sets added in the routine editor don't shift the "previous"
  // column out of alignment with what was actually logged last time.
  function previousSetLabel(exerciseId, setIndex) {
    const found = lastCompletedWorkoutFor(exerciseId);
    if (!found) return "—";
    const completedSets = found.exercise.sets.filter((s) => s.completed && !s.isWarmup);
    const s = completedSets[setIndex];
    if (!s) return "—";
    return `${weightToDisplay(s.weight)}×${s.reps}`;
  }

  // Builds a starting set list for an exercise that's just been added to a
  // freeform workout (no routine), pre-filled with the weight/reps from the
  // last time it was performed so the person doesn't have to retype it.
  // Falls back to blank sets if there's no history yet.
  function defaultSetsForExercise(exerciseId, count) {
    const found = lastCompletedWorkoutFor(exerciseId);
    const completed = found ? found.exercise.sets.filter((s) => s.completed && !s.isWarmup) : [];
    const n = count || completed.length || 3;
    return Array.from({ length: n }, (_, i) => {
      const prev = completed[i];
      return { weight: prev ? prev.weight : "", reps: prev ? prev.reps : "", completed: false };
    });
  }

  // Builds the starting set list for a workout started from a routine.
  // Each routine set carries its own planned weight/reps/warmup flag; any
  // left blank fall back to what was logged last time for that exercise
  // (matched by position among working sets, so warmups don't throw off
  // the alignment).
  function buildWorkoutSetsFromRoutine(exerciseId, routineSets) {
    const found = lastCompletedWorkoutFor(exerciseId);
    const completed = found ? found.exercise.sets.filter((s) => s.completed && !s.isWarmup) : [];
    let workingIdx = 0;
    return routineSets.map((rs) => {
      const isWarmup = !!rs.isWarmup;
      const prev = isWarmup ? null : completed[workingIdx++];
      const hasWeight = rs.weight !== "" && rs.weight != null;
      const hasReps = rs.reps !== "" && rs.reps != null;
      const weight = hasWeight ? rs.weight : (prev ? prev.weight : "");
      const reps = hasReps ? rs.reps : (prev ? prev.reps : "");
      return { weight, reps, completed: false, isWarmup };
    });
  }

  // Most recent effort score logged for a routine (template), so its card
  // on Home can show "Last: NN% effort" — state.workouts is already sorted
  // newest-first, so the first match is the most recent one.
  function lastEffortForRoutine(routineId) {
    for (const w of state.workouts) {
      if (w.routineId === routineId && typeof w.effortScore === "number") return w.effortScore;
    }
    return null;
  }

  function bestWeightFor(exerciseId, excludeWorkoutId) {
    let best = 0;
    for (const w of state.workouts) {
      if (w.id === excludeWorkoutId) continue;
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!ex) continue;
      for (const s of ex.sets) {
        if (s.completed && !s.isWarmup && s.weight > best) best = s.weight;
      }
    }
    return best;
  }

  function estOneRm(weightLb, reps) {
    if (!reps || reps <= 0) return weightLb;
    return weightLb * (1 + reps / 30);
  }

  // ===== Plate calculator =====
  // Given a target total barbell weight (lb), returns the plates to load on
  // ONE side, largest-first, using the plate denominations available in
  // Settings. Greedy from largest plate down — always optimal for a real,
  // decreasing plate set. Returns { perSide:[..], leftover, achievable }.
  function computePlates(totalLb) {
    const bar = state.settings.barWeightLb || 45;
    const plates = (state.settings.platesLb || []).slice().sort((a, b) => b - a);
    if (totalLb == null || totalLb < bar) return { perSide: [], leftover: 0, achievable: totalLb === bar };
    let perSideWeight = (totalLb - bar) / 2;
    const perSide = [];
    for (const p of plates) {
      while (perSideWeight >= p - 1e-6) { perSide.push(p); perSideWeight -= p; }
    }
    const leftover = Math.round(perSideWeight * 100) / 100;
    return { perSide, leftover, achievable: leftover < 1e-6 };
  }

  // ===== Warm-up ramp =====
  // Builds a set of warmup sets ramping to a top working weight. Standard
  // powerlifting ramp: bar, then ~40/55/70/85% of the top set, reps
  // descending as load climbs. Each percentage is rounded to the smallest
  // loadable increment (2× the smallest available plate).
  function warmupRamp(topWeightLb) {
    const bar = state.settings.barWeightLb || 45;
    if (!(topWeightLb > bar)) return [];
    const smallest = Math.min(...(state.settings.platesLb || [2.5]));
    const step = smallest * 2; // both sides
    const roundTo = (w) => Math.max(bar, Math.round(w / step) * step);
    const plan = [
      { pct: 0, reps: 8, weight: bar },
      { pct: 0.4, reps: 5 },
      { pct: 0.6, reps: 3 },
      { pct: 0.8, reps: 2 },
    ];
    const seen = new Set();
    const out = [];
    for (const p of plan) {
      const w = p.weight != null ? p.weight : roundTo(topWeightLb * p.pct);
      if (w >= topWeightLb) continue;      // never "warm up" at/above the work weight
      if (seen.has(w)) continue;            // skip duplicates after rounding
      seen.add(w);
      out.push({ weight: w, reps: p.reps, isWarmup: true, completed: false });
    }
    return out;
  }

  // ===== Weekly muscle-group volume =====
  // Hard working sets per muscle group over the last `days` days — the
  // hypertrophy community's core "are you training everything enough?"
  // signal, and a direct read on the effort model's Muscle axis.
  function weeklyMuscleVolume(days = 7) {
    const cutoff = Date.now() - days * 86400000;
    const counts = {};
    for (const w of state.workouts) {
      if (new Date(w.date).getTime() < cutoff) continue;
      for (const e of w.exercises) {
        const ex = exerciseById(e.exerciseId);
        if (!ex) continue;
        const working = e.sets.filter((s) => s.completed && !s.isWarmup).length;
        if (working) counts[ex.muscle] = (counts[ex.muscle] || 0) + working;
      }
    }
    return Object.entries(counts).map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets);
  }

  // ===== Cross-modality sessions (strength workouts + cardio activities) =====
  // A strength workout (state.workouts) and a cardio activity (state.activities,
  // see ACTIVITY_TYPES below) are different shapes — one has .exercises/.sets,
  // the other has .activityType/.rpe — so anything that needs to reason about
  // "everything you did" goes through these two helpers rather than touching
  // state.workouts directly, to keep the two data models from leaking into
  // each other's 70+ existing call sites.
  function isCardioSession(s) { return !s.exercises; }

  function allSessions() {
    return [...state.workouts, ...state.activities].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // Unified per-session training load, independent of modality — the
  // session-RPE method (Foster et al. 2001: load = duration(min) × RPE),
  // the standard way sports science quantifies load without heart-rate
  // data. Cardio activities carry a direct user-rated RPE (1–10); a
  // strength workout has no explicit RPE, so its effort score (already
  // 0–100) stands in as an RPE-equivalent (÷10). This is what lets the
  // Home hero card's acute:chronic ratio reflect total training stress —
  // lifting, a run, or a pickup game — on one scale.
  function sessionLoad(s) {
    const minutes = (s.durationSec || 0) / 60;
    if (!minutes) return 0;
    if (typeof s.rpe === "number") return minutes * s.rpe;
    if (typeof s.effortScore === "number") return minutes * (s.effortScore / 10);
    return 0;
  }

  // ===== Training calendar / streak / frequency =====
  // Set of YYYY-MM-DD strings on which at least one session (strength or
  // cardio) was logged.
  function workoutDaySet() {
    const set = new Set();
    for (const s of allSessions()) set.add(new Date(s.date).toISOString().slice(0, 10));
    return set;
  }

  // Unified per-session load (see sessionLoad) per calendar day, for the
  // History calendar's dot-density tiering — a heavy lift day and a hard
  // long run both read as "a lot of training" that day.
  function dayVolumeMap() {
    const map = new Map();
    for (const s of allSessions()) {
      const ds = new Date(s.date).toISOString().slice(0, 10);
      map.set(ds, (map.get(ds) || 0) + sessionLoad(s));
    }
    return map;
  }

  // Classifies a day's volume against the heaviest logged day on record,
  // for the three-tier dot size/intensity on the History calendar
  // (reference: the Outsiders' Training Summary dot grid).
  function dayVolumeTier(volume, maxVolume) {
    if (!maxVolume) return "light";
    const frac = volume / maxVolume;
    return frac < 0.34 ? "light" : frac < 0.67 ? "medium" : "heavy";
  }

  // Current streak = consecutive weeks (Mon–Sun) with ≥1 workout, counting
  // back from this week. This week doesn't break the streak until it ends.
  function weekStreak() {
    const sessions = allSessions();
    if (sessions.length === 0) return 0;
    const weekKey = (d) => {
      const dt = new Date(d);
      const day = (dt.getDay() + 6) % 7; // Mon=0
      dt.setDate(dt.getDate() - day); dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    };
    const weeks = new Set(sessions.map((w) => weekKey(w.date)));
    const WEEK = 7 * 86400000;
    let cursor = weekKey(Date.now());
    let streak = 0;
    if (!weeks.has(cursor)) cursor -= WEEK; // allow an as-yet-empty current week
    while (weeks.has(cursor)) { streak++; cursor -= WEEK; }
    return streak;
  }

  function workoutsThisWeek() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
    return allSessions().filter((w) => new Date(w.date) >= monday).length;
  }

  // ===== Auto-progression suggestion =====
  // Looks at the most recent session for an exercise. If the top working set
  // was completed at RPE ≤ 8 (or, with no RPE logged, hit ≥ the app's rep
  // target of 5), suggest a small load bump for next time; otherwise suggest
  // repeating the weight. Increment = 2× smallest plate (min loadable jump),
  // ×2 again for lower-body compounds which progress faster.
  function progressionSuggestion(exerciseId) {
    const found = lastCompletedWorkoutFor(exerciseId);
    if (!found) return null;
    const working = found.exercise.sets.filter((s) => s.completed && !s.isWarmup);
    if (!working.length) return null;
    const top = working.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
    if (!(top.weight > 0)) return null;
    const ex = exerciseById(exerciseId);
    const smallest = Math.min(...(state.settings.platesLb || [2.5]));
    let step = smallest * 2;
    if (ex && (ex.muscle === "Legs" || ex.muscle === "Back") && ex.equipment === "Barbell") step *= 2;
    const easy = (typeof top.rpe === "number" ? top.rpe <= 8 : (top.reps || 0) >= 5) && top.type !== "failure";
    const next = easy ? Math.round((top.weight + step) / smallest) * smallest : top.weight;
    return { last: top.weight, next, bumped: next > top.weight, reps: top.reps };
  }

  // ===== Bodyweight log =====
  function currentBodyWeightLb() {
    const log = state.settings.bodyWeightLog || [];
    if (log.length) return log[log.length - 1].lb;
    return state.settings.bodyWeightLb || null;
  }

  function logBodyWeight(lb) {
    if (!(lb > 0)) return;
    const log = state.settings.bodyWeightLog || (state.settings.bodyWeightLog = []);
    const today = new Date().toISOString().slice(0, 10);
    const existing = log.find((e) => e.date.slice(0, 10) === today);
    if (existing) existing.lb = lb;
    else log.push({ date: new Date().toISOString(), lb });
    log.sort((a, b) => new Date(a.date) - new Date(b.date));
    state.settings.bodyWeightLb = log[log.length - 1].lb; // keep mirror in sync
    saveSettings();
  }

  // ---------- Effort scoring ----------
  // Every completed workout gets a 0-100 "effort score" built from hard
  // sets: each working set contributes based mostly on how close it was to
  // your all-time best for that exercise (so a near-max triple counts for
  // about as much as a hard set of 8 — heavy strength work is NOT scored
  // by rep count), with a mild rep bonus, scaled by how inherently
  // demanding the exercise is (a squat taxes far more than a curl, even at
  // the "same" relative intensity). The score is normalized against your
  // own historical best, so it self-calibrates as you get stronger instead
  // of chasing a fixed, arbitrary ceiling.

  // Fallback difficulty heuristic (equipment x muscle-mass x movement
  // pattern) — used only for custom exercises with no hand-scored profile
  // in exercise-standards.js (see difficultyInfo below). It's intentionally approximate — the goal is "mostly
  // right on average," not a perfect biomechanics model.
  const MUSCLE_DIFFICULTY = {
    "Full Body": 1.25, Legs: 1.15, Back: 1.1, Chest: 1.05, Glutes: 1.05,
    Shoulders: 1.0, Core: 0.9, Biceps: 0.85, Triceps: 0.85, Calves: 0.85, Forearms: 0.8,
  };
  const EQUIPMENT_DIFFICULTY = {
    Barbell: 1.15, Kettlebell: 1.1, Dumbbell: 1.05, Bodyweight: 1.05,
    Cable: 0.95, Other: 0.9, Machine: 0.85, Band: 0.8,
  };
  // Checked in order: an unambiguous "very high" match wins first, then
  // isolation-style words are checked (so e.g. "Leg press calf raise"
  // reads as an isolation calf move, not a high-effort press), then
  // everything else compound-ish, then a moderate default.
  const MOVEMENT_VERY_HIGH = ["deadlift", "squat", "clean and jerk", "snatch", "power clean", "thruster", "clean"];
  const MOVEMENT_LOW = ["curl", "extension", "lateral raise", "front raise", "calf raise", "fly", "flye", "kickback", "pushdown", "shrug", "crunch", "sit-up", "v-up", "plank", "pinch", "wrist"];
  const MOVEMENT_HIGH = ["hyperextension", "rack pull", "farmer", "carry", "kettlebell swing", "swing", "turkish get-up", "get-up", "burpee", "box jump", "jump", "battle rope", "press", "row", "pull-up", "chin-up", "pulldown", "dip", "lunge", "step-up", "hip thrust", "good morning"];

  function movementTier(name) {
    const n = (name || "").toLowerCase();
    if (MOVEMENT_VERY_HIGH.some((k) => n.includes(k))) return "veryHigh";
    if (MOVEMENT_LOW.some((k) => n.includes(k))) return "low";
    if (MOVEMENT_HIGH.some((k) => n.includes(k))) return "high";
    return "moderate";
  }

  function movementFactor(name) {
    const tier = movementTier(name);
    if (tier === "veryHigh") return 1.3;
    if (tier === "low") return 0.85;
    if (tier === "high") return 1.15;
    return 1.0;
  }

  function heuristicDifficulty(ex) {
    if (!ex) return 1.0;
    const muscle = MUSCLE_DIFFICULTY[ex.muscle] ?? 1.0;
    const equipment = EQUIPMENT_DIFFICULTY[ex.equipment] ?? 1.0;
    const movement = movementFactor(ex.name);
    return Math.max(0.65, Math.min(1.65, muscle * equipment * movement));
  }

  // ===== Exercise difficulty tiers (effort v6) =====
  // Every library exercise has a hand-scored profile in exercise-standards.js
  // (muscle mass m, spinal load a, skill/stability s → points = 2m + a + s,
  // 2–10). That replaces the name-keyword guess above for library lifts; a
  // custom exercise with no profile still uses the heuristic, so nothing
  // the user adds goes unscored.
  const DIFFICULTY_TIERS = [
    { tier: "S", min: 9 }, { tier: "A", min: 7 }, { tier: "B", min: 5 }, { tier: "C", min: 3 }, { tier: "D", min: 0 },
  ];
  function difficultyInfo(ex) {
    if (!ex) return null;
    const d = (typeof EXERCISE_DIFFICULTY !== "undefined" && EXERCISE_DIFFICULTY[ex.id]) || null;
    let points, factor;
    if (d) {
      points = 2 * d.m + d.a + d.s;
      factor = 0.65 + (points - 2) * 0.125;
    } else {
      factor = heuristicDifficulty(ex);
      points = Math.max(2, Math.min(10, Math.round(2 + (factor - 0.65) / 0.125)));
    }
    const tier = DIFFICULTY_TIERS.find((t) => points >= t.min).tier;
    return { points, tier, factor, parts: d, estimated: !d };
  }
  function exerciseDifficulty(ex) {
    if (!ex) return 1.0;
    return difficultyInfo(ex).factor;
  }

  // ===== Strength levels (Strength Level standards, male) =====
  // A set's weight × reps becomes an Epley e1RM (reps capped at 12, past
  // which Epley over-reads), then is placed against strengthlevel.com's
  // community standards for that lift at the lifter's bodyweight on the
  // day. Bodyweight lifts with rep standards compare reps; added load on
  // a bodyweight lift converts to equivalent bodyweight reps (Epley).
  const STRENGTH_LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
  const STRENGTH_LEVEL_PCTL = [5, 20, 50, 80, 95];
  const RANK_MAX_REPS = 12;

  function strengthStandardFor(ex) {
    if (!ex || typeof EXERCISE_STANDARD_KEY === "undefined") return null;
    const key = EXERCISE_STANDARD_KEY[ex.id];
    return key && STRENGTH_STANDARDS[key] ? STRENGTH_STANDARDS[key] : null;
  }

  // Bodyweight on a given date: latest log entry on/before it, else the
  // earliest entry, else the current setting. null = no bodyweight known.
  function bodyWeightOn(dateIso) {
    const log = (state.settings.bodyWeightLog || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!log.length) return currentBodyWeightLb();
    const t = dateIso ? new Date(dateIso).getTime() : Date.now();
    let bw = log[0].lb;
    for (const e of log) { if (new Date(e.date).getTime() <= t) bw = e.lb; else break; }
    return bw;
  }

  // Five thresholds at bodyweight `bw`, linearly interpolated between the
  // table's 10-lb rows (clamped to the table's 110–310 lb range).
  function standardsAt(std, bw) {
    const rows = std.rows;
    if (bw <= rows[0][0]) return rows[0].slice(1);
    const last = rows[rows.length - 1];
    if (bw >= last[0]) return last.slice(1);
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (bw >= a[0] && bw <= b[0]) {
        const f = (bw - a[0]) / (b[0] - a[0]);
        return a.slice(1).map((v, k) => v + (b[k + 1] - v) * f);
      }
    }
    return last.slice(1);
  }

  // The number a set is ranked on: e1RM (lb) or reps, per the standard.
  function setStrengthValue(set, ex, std, bw) {
    if (!set || !set.completed || set.isWarmup || !(set.reps > 0)) return null;
    if (std.unit === "reps") {
      const added = ex.equipment === "Bodyweight" ? (set.weight || 0) : 0;
      if (added > 0 && bw > 0) return 30 * ((bw + added) * (1 + set.reps / 30) / bw - 1);
      return set.reps;
    }
    if (!(set.weight > 0) || set.reps > RANK_MAX_REPS) return null;
    return estOneRm(set.weight, set.reps);
  }

  // value → { level, levelIndex (0–4), pctl, thresholds, next }.
  // Percentile is piecewise-linear between the published level cut-offs
  // (5/20/50/80/95); above Elite it eases toward 99.9 by 1.25 × Elite.
  function strengthRankFromValue(value, th, unit) {
    const P = STRENGTH_LEVEL_PCTL;
    let pctl;
    const beg = th[0] > 0 ? th[0] : 1;
    if (value < beg) pctl = Math.max(0, 5 * value / beg);
    else if (value >= th[4]) pctl = Math.min(99.9, 95 + 4.9 * (value - th[4]) / (th[4] * 0.25));
    else {
      pctl = 95;
      for (let i = 0; i < 4; i++) {
        if (value < th[i + 1]) { pctl = P[i] + (P[i + 1] - P[i]) * (value - th[i]) / (th[i + 1] - th[i]); break; }
      }
    }
    let levelIndex = 0;
    for (let i = 0; i < 5; i++) if (value >= th[i] && th[i] > 0) levelIndex = i;
    const belowBeginner = th[0] > 0 && value < th[0];
    const nextIdx = belowBeginner ? 0 : levelIndex + 1;
    const next = nextIdx <= 4 ? { level: STRENGTH_LEVELS[nextIdx], target: th[nextIdx], gap: th[nextIdx] - value } : null;
    return { level: STRENGTH_LEVELS[levelIndex], levelIndex, pctl, thresholds: th, value, unit, next, belowBeginner };
  }

  // Best rank across a list of sets (one workout's exercise, or history).
  function rankSets(ex, sets, dateIso) {
    const std = strengthStandardFor(ex);
    if (!std) return null;
    const bw = bodyWeightOn(dateIso);
    if (!(bw > 0)) return null;
    let best = null, bestSet = null;
    for (const s of sets) {
      const v = setStrengthValue(s, ex, std, bw);
      if (v != null && (best == null || v > best)) { best = v; bestSet = s; }
    }
    if (best == null) return null;
    const r = strengthRankFromValue(best, standardsAt(std, bw), std.unit);
    r.set = bestSet; r.bodyWeight = bw; r.slug = std.slug;
    return r;
  }

  // All-time best rank for an exercise (each set judged at that day's bodyweight).
  function bestStrengthRank(exerciseId) {
    const ex = exerciseById(exerciseId);
    let best = null;
    for (const w of state.workouts) {
      const e = w.exercises.find((x) => x.exerciseId === exerciseId);
      if (!e) continue;
      const r = rankSets(ex, e.sets, w.date);
      if (r && (!best || r.pctl > best.pctl)) { best = r; best.date = w.date; }
    }
    return best;
  }

  function rankValueLabel(r, v) {
    return r.unit === "reps" ? `${Math.round(v)} reps` : `${Math.round(weightToDisplay(v))} ${unitLabel()}`;
  }
  function levelBadgeHtml(r) {
    if (!r) return "";
    return `<span class="lvl-badge lvl-${r.levelIndex}${r.belowBeginner ? " lvl-under" : ""}">${r.level}</span>`;
  }
  function tierChipHtml(ex) {
    const d = difficultyInfo(ex);
    return d ? `<span class="tier-chip tier-${d.tier}" title="Difficulty ${d.points}/10">${d.tier}</span>` : "";
  }
  // ===== Training coach (muscle-building + strength) =====
  // Program-independent rules built on the current dose-response research:
  //  • Volume — weekly FRACTIONAL sets per muscle (primary mover 1, helper
  //    0.5), the counting method that best predicts growth. Growth rises
  //    with volume with diminishing returns; ~10–20 weekly sets per muscle
  //    is the productive range for trained lifters. (Pelland et al. 2024)
  //  • Per session — returns flatten past ~11 fractional sets for one
  //    muscle in one session; split it across days. (Remmert et al. 2025)
  //  • Effort — growth is greater the closer sets go to failure, strength
  //    isn't. So sets of 6+ reps should end ~0–3 RIR; heavy low-rep sets
  //    don't need to. (Robinson et al. 2024)
  //  • Exercise selection — regional growth needs more than one movement:
  //    overhead elbow extension grows the triceps long head far more than
  //    pushdowns (Maeo 2023); squats barely grow the hamstrings or rectus
  //    femoris, so knee-flexion and knee-extension work are needed (Kubo
  //    2019; Maeo 2021, seated curl > lying); training at long muscle
  //    lengths grows more (Wolf et al. 2025).
  //  • Strength — needs regular heavy exposure (>~80% 1RM; Lopez et al.
  //    2021) and benefits from frequency, unlike hypertrophy (Pelland 2024).
  //  • Rest — >60–90 s between sets slightly favours growth (Singer 2024).
  // Program rules always win: the hinge/back rule, the squat-volume cap and
  // anti-flexion-only core are respected, and every suggestion is advice —
  // nothing is auto-applied.
  const MUSCLE_LABELS = {
    chest: "Chest", frontDelts: "Front delts", sideDelts: "Side delts", rearDelts: "Rear delts",
    lats: "Lats", upperBack: "Upper back", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
    quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", adductors: "Adductors", calves: "Calves",
    abs: "Abs", lowerBack: "Lower back",
  };
  // Weekly fractional-set targets. Front delts get heavy indirect work from
  // every press, so their floor is low. Forearms/adductors/lower back are
  // tracked but never nagged.
  const MUSCLE_TARGETS = {
    chest: [10, 20], lats: [10, 20], upperBack: [10, 20], sideDelts: [10, 20], rearDelts: [6, 16],
    frontDelts: [4, 16], biceps: [8, 20], triceps: [8, 20], quads: [10, 20], hamstrings: [8, 20],
    glutes: [8, 20], calves: [8, 16], abs: [6, 16],
  };
  const COACH_SESSION_CAP = 11;
  const COACH_HEAVY_PCT = 0.8;
  const COACH_SUPPRESS_BLOCKS = ["Deload", "Re-express"];
  const COARSE_TO_FINE = {
    Chest: ["chest"], Back: ["lats", "upperBack"], Shoulders: ["sideDelts"], Biceps: ["biceps"], Triceps: ["triceps"],
    Legs: ["quads"], Glutes: ["glutes"], Calves: ["calves"], Core: ["abs"], Forearms: ["forearms"], "Full Body": ["quads", "glutes"],
  };

  function exerciseMuscles(ex) {
    if (!ex) return { p: [], s: [], t: [], L: false };
    const m = typeof EXERCISE_MUSCLES !== "undefined" ? EXERCISE_MUSCLES[ex.id] : null;
    if (m) return { p: m.p, s: m.s, t: m.t, L: !!m.L };
    return { p: COARSE_TO_FINE[ex.muscle] || [], s: [], t: [], L: false };
  }

  // Standing training constraints, carried over from the retired program at
  // Alex's request (2026-10-19: "keep all of them"). Both the coach and the
  // suggested-workout generator honour these.
  const TRAINING_RULES = {
    hinge: "Lower back ACTIVE. No conventional deadlift, RDL, good morning, bent-over barbell row or unsupported loaded hinge. The hinge slot is a hip thrust at RPE <= 7. Every row is chest-supported. Core is anti-flexion / anti-rotation only.",
    squatVolume: "Squat back-offs never exceed 4 sets of 5 (his body does not tolerate more). Extra quad stimulus comes from leg press or hack squat, never the barbell squat.",
    shoulder: "Right shoulder subacromial pain pattern: Alex modifies delt and pressing slots himself. Shoulder-friendly versions: scapular-plane raises, cables and machines over heavy dumbbells.",
    perSession: "No muscle gets more than ~10-11 hard sets in one session.",
  };
  function programRules() { return TRAINING_RULES; }
  // The deload state now comes from the suggested-week engine (a planned
  // easy week every 5th week), not a program calendar.
  function currentBlock() {
    try { const sw = suggestedWeek(); return sw && sw.deload ? "Deload" : null; } catch (e) { return null; }
  }

  function workingSets(e) { return e.sets.filter((s) => s.completed && !s.isWarmup && (s.reps || 0) > 0); }

  // { muscle: fractionalSets } for a list of workouts, plus the max any
  // single session put on each muscle.
  function fractionalVolume(workouts) {
    const total = {}, sessionMax = {}, sessionMaxWorkout = {};
    for (const w of workouts) {
      const sess = {};
      for (const e of w.exercises) {
        const ex = exerciseById(e.exerciseId);
        const n = workingSets(e).length;
        if (!ex || !n) continue;
        const mm = exerciseMuscles(ex);
        mm.p.forEach((m) => { sess[m] = (sess[m] || 0) + n; });
        mm.s.forEach((m) => { if (!mm.p.includes(m)) sess[m] = (sess[m] || 0) + n * 0.5; });
      }
      for (const [m, v] of Object.entries(sess)) {
        total[m] = (total[m] || 0) + v;
        if (v > (sessionMax[m] || 0)) { sessionMax[m] = v; sessionMaxWorkout[m] = w; }
      }
    }
    return { total, sessionMax, sessionMaxWorkout };
  }

  // Estimated reps in reserve for a set: logged RPE / failure flag first,
  // else the Epley estimate against your best e1RM. null when unknowable.
  function estimateSetRir(set, ex, bestE1rm) {
    if (set.type === "failure") return 0;
    if (typeof set.rpe === "number" && set.rpe > 0) return Math.max(0, 10 - set.rpe);
    const load = effectiveLoad(set, ex);
    if (!(load > 0) || !(bestE1rm > 0)) return null;
    return Math.max(0, 30 * (bestE1rm / load - 1) - set.reps);
  }

  function workoutsWithin(days, now = Date.now()) {
    const cut = now - days * 86400000;
    return state.workouts.filter((w) => new Date(w.date).getTime() >= cut);
  }

  // Per-muscle exercise suggestions, filtered by the program's constraints.
  function coachSuggestFor(muscle, need) {
    const r = programRules();
    const S = {
      chest: { press: "a dumbbell or machine press", fly: "a deep dumbbell fly or cable fly", any: "dumbbell presses and cable flyes" },
      lats: { vertical: "lat pulldowns or pull-ups", any: "pulldowns or pull-ups" },
      upperBack: { horizontal: r.hinge ? "chest-supported or machine rows" : "rows (chest-supported keeps it easy on the back)", any: r.hinge ? "chest-supported rows" : "rows" },
      sideDelts: { lateral: "lateral raises (cable or machine, in the scapular plane)", any: "lateral raises" },
      rearDelts: { rear: "reverse pec deck or face pulls", any: "reverse pec deck or face pulls" },
      frontDelts: { any: "overhead or incline pressing" },
      biceps: { stretch: "incline dumbbell curls or preacher curls", any: "curls (incline or preacher for the stretch)" },
      triceps: { overhead: "overhead cable or dumbbell extensions", extension: "pushdowns or skull crushers", any: "overhead extensions and pushdowns" },
      quads: { "knee-ext": "leg extensions", any: r.squatVolume ? "leg press or hack squat (squat volume is capped by your program)" : "leg press, hack squat or leg extensions" },
      hamstrings: { "knee-flex": "seated leg curls (they out-grow lying curls)", hinge: "RDLs", any: r.hinge ? "seated leg curls" : "seated leg curls and RDLs" },
      glutes: { "hip-ext": "hip thrusts", abduction: "hip abduction", any: "hip thrusts or lunges" },
      calves: { straight: "standing calf raises with a full stretch", bent: "seated calf raises", any: "standing and seated calf raises" },
      abs: { anti: "Pallof presses, dead bugs or planks", flexion: "cable crunches", any: r.hinge ? "Pallof presses or dead bugs (anti-rotation only for now)" : "cable crunches and Pallof presses" },
    };
    const m = S[muscle] || {};
    return m[need] || m.any || "more direct work";
  }

  function trainingInsights(opts = {}) {
    const now = opts.now || Date.now();
    const out = [];
    const recent28 = workoutsWithin(28, now);
    if (recent28.length < 3) {
      if (state.workouts.length) out.push({ kind: "info", title: "Coach is warming up", body: "Log a few more sessions (3+ in four weeks) and the coach starts checking your volume, effort and exercise mix per muscle.", cite: null, muscles: [] });
      return out;
    }
    const rules = programRules();
    const block = currentBlock();
    const easyWeek = COACH_SUPPRESS_BLOCKS.includes(block);
    const earliest = Math.min(...recent28.map((w) => new Date(w.date).getTime()));
    const weeks = Math.max(1, Math.min(4, (now - earliest) / (7 * 86400000) + 1 / 7));
    const vol = fractionalVolume(recent28);
    const perWeek = (m) => (vol.total[m] || 0) / weeks;
    const fmt = (v) => (v < 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v)));

    // Movement types and long-length work seen per muscle (28 days).
    const types = new Set(), lengthened = new Set();
    for (const w of recent28) for (const e of w.exercises) {
      const ex = exerciseById(e.exerciseId);
      if (!ex || !workingSets(e).length) continue;
      const mm = exerciseMuscles(ex);
      mm.t.forEach((t) => types.add(t));
      if (mm.L) mm.p.forEach((m) => lengthened.add(m));
    }

    // 1) Volume per muscle.
    if (!easyWeek) {
      for (const [m, [lo, hi]] of Object.entries(MUSCLE_TARGETS)) {
        if (m === "abs" && rules.hinge) continue;
        const v = perWeek(m);
        if (v < lo * 0.5) {
          out.push({ kind: "warn", pri: 1, title: `${MUSCLE_LABELS[m]} neglected · ${fmt(v)} sets/wk`, body: `Well under the ${lo}–${hi} weekly sets that drive growth. Add ${Math.ceil(lo - v)} sets a week of ${coachSuggestFor(m, "any")}, split across two sessions.`, cite: "Pelland et al. 2024", muscles: [m] });
        } else if (v < lo) {
          out.push({ kind: "suggest", pri: 2, title: `${MUSCLE_LABELS[m]} below the growth range · ${fmt(v)} sets/wk`, body: `About ${Math.ceil(lo - v)} more weekly sets would put it in the ${lo}–${hi} range. Easiest add: ${coachSuggestFor(m, "any")}.`, cite: "Pelland et al. 2024", muscles: [m] });
        } else if (v > hi + 5) {
          out.push({ kind: "info", pri: 5, title: `${MUSCLE_LABELS[m]} volume is very high · ${fmt(v)} sets/wk`, body: "Gains keep coming with more volume but with diminishing returns. Fine while recovery, joints and performance hold; it's the first place to trim if they don't.", cite: "Pelland et al. 2024", muscles: [m] });
        }
      }
    }

    // 2) Per-session cap (last 14 days).
    const vol14 = fractionalVolume(workoutsWithin(14, now));
    for (const [m, v] of Object.entries(vol14.sessionMax)) {
      if (!MUSCLE_TARGETS[m] || v <= COACH_SESSION_CAP + 0.5) continue;
      const w = vol14.sessionMaxWorkout[m];
      out.push({ kind: "suggest", pri: 3, title: `${MUSCLE_LABELS[m]}: ${fmt(v)} sets in one session`, body: `${w.name} on ${fmtDate(w.date)} put ${fmt(v)} sets on ${MUSCLE_LABELS[m].toLowerCase()}. Past ~${COACH_SESSION_CAP} per session the extra sets add little. Move a few to another day instead of cutting them.`, cite: "Remmert et al. 2025", muscles: [m] });
    }

    // 3) Effort — hypertrophy-range sets (6+ reps) left too far from failure.
    if (!easyWeek) {
      const rirBy = {};
      for (const w of workoutsWithin(14, now)) for (const e of w.exercises) {
        const ex = exerciseById(e.exerciseId);
        if (!ex) continue;
        const best = bestE1rmAllTime(ex.id);
        for (const s of workingSets(e)) {
          if (s.reps < 6) continue;
          const rir = estimateSetRir(s, ex, best);
          if (rir == null) continue;
          for (const m of exerciseMuscles(ex).p) (rirBy[m] = rirBy[m] || []).push(Math.min(rir, 8));
        }
      }
      const soft = Object.entries(rirBy)
        .filter(([m, a]) => MUSCLE_TARGETS[m] && a.length >= 4 && a.reduce((x, y) => x + y, 0) / a.length >= 3.5)
        .map(([m, a]) => ({ m, avg: a.reduce((x, y) => x + y, 0) / a.length }))
        .sort((a, b) => b.avg - a.avg);
      if (soft.length) {
        const list = soft.slice(0, 4).map((x) => `${MUSCLE_LABELS[x.m].toLowerCase()} (~${x.avg.toFixed(1)} RIR)`).join(", ");
        out.push({ kind: "warn", pri: 1, title: "Push harder on your growth sets", body: `Sets of 6+ reps for ${list} are ending too far from failure. Growth rises the closer you get, so finish those sets at 0–3 reps in reserve (RPE 7–10). Your heavy low-rep strength sets don't need this, and your program's RPE caps on the comp lifts still apply.`, cite: "Robinson et al. 2024", muscles: soft.map((x) => x.m) });
      }
    }

    // 4) Exercise-type coverage per muscle (28 days).
    const trained = (m) => perWeek(m) >= 2;
    const COVER = [
      { m: "triceps", t: "triceps:overhead", need: "overhead", kind: "suggest", why: "Overhead extensions stretch the long head (the biggest part of the triceps) and grew it far more than pushdowns in a head-to-head study.", cite: "Maeo et al. 2023" },
      { m: "quads", t: "quads:knee-ext", need: "knee-ext", kind: "suggest", why: "Squats and presses barely grow the rectus femoris; it needs knee-extension work.", cite: "Zabaleta-Korta 2021; Kubo 2019" },
      { m: "hamstrings", t: "hams:knee-flex", need: "knee-flex", kind: "warn", why: "Squats don't grow the hamstrings, so you need direct knee flexion. Seated curls train them at long lengths and grew more than lying curls.", cite: "Kubo 2019; Maeo et al. 2021", always: true },
      { m: "lats", t: "back:vertical", need: "vertical", kind: "suggest", why: "Vertical pulls bias the lats; rows alone lean on the mid-back.", cite: "Kassiano 2022 (variation)" },
      { m: "upperBack", t: "back:horizontal", need: "horizontal", kind: "suggest", why: "Rows hit the mid-back and rear delts in a way pulldowns don't.", cite: "Kassiano 2022 (variation)" },
      { m: "sideDelts", t: "delts:lateral", need: "lateral", kind: "warn", why: "Pressing barely touches the side delts. They grow from raises.", cite: "Pelland et al. 2024 (direct vs indirect)", always: true },
      { m: "rearDelts", t: "delts:rear", need: "rear", kind: "info", why: "Rows help, but direct rear-delt work fills out the back of the shoulder.", cite: null },
      { m: "chest", t: "chest:fly", need: "fly", kind: "info", why: "A stretch-loaded fly adds a long-length stimulus that presses alone don't.", cite: "Wolf et al. 2025", alt: "chest" },
      { m: "biceps", t: "biceps:stretch", need: "stretch", kind: "info", why: "Curls that load the biceps stretched (incline, preacher) add growth at long lengths.", cite: "Wolf et al. 2025; Pedrosa 2023" },
      { m: "calves", t: "calves:bent", need: "bent", kind: "info", why: "Bent-knee raises target the soleus, which standing raises only partly reach.", cite: null },
      { m: "calves", t: "calves:straight", need: "straight", kind: "info", why: "Straight-knee raises with a deep stretch train the gastrocnemius at long lengths.", cite: "Wolf et al. 2025" },
      { m: "glutes", t: "glutes:hip-ext", need: "hip-ext", kind: "info", why: "Hip extension at load is the main glute grower.", cite: null },
    ];
    if (!rules.hinge) COVER.push({ m: "hamstrings", t: "hams:hinge", need: "hinge", kind: "info", why: "A hip hinge trains the hamstrings at long lengths from the hip end.", cite: "Wolf et al. 2025" });
    const coveredFlag = new Set();
    const neglected = new Set(out.filter((i) => / neglected /.test(i.title)).flatMap((i) => i.muscles));
    for (const c of COVER) {
      if (types.has(c.t)) continue;
      if (neglected.has(c.m)) {
        // Fold the missing-movement advice into the volume warning instead of a second card.
        const v = out.find((i) => / neglected /.test(i.title) && i.muscles.includes(c.m));
        if (v && !v.folded) { v.body = v.body.replace(coachSuggestFor(c.m, "any"), coachSuggestFor(c.m, c.need)) + " " + c.why; v.cite = [v.cite, c.cite].filter(Boolean).join("; "); v.folded = true; }
        coveredFlag.add(c.m);
        continue;
      }
      if (c.alt && lengthened.has(c.alt)) continue;
      if (!c.always && !trained(c.m)) continue;
      coveredFlag.add(c.m);
      out.push({ kind: c.kind, pri: c.kind === "warn" ? 2 : c.kind === "suggest" ? 3 : 6, title: `${MUSCLE_LABELS[c.m]}: no ${coachSuggestFor(c.m, c.need).split(" (")[0]} in 4 weeks`, body: `${c.why} Add 2–4 weekly sets of ${coachSuggestFor(c.m, c.need)}.`, cite: c.cite, muscles: [c.m] });
    }
    // Long-length work (quads, chest, triceps) when not already flagged above.
    for (const m of ["quads", "chest", "triceps", "calves"]) {
      if (coveredFlag.has(m) || !trained(m) || lengthened.has(m)) continue;
      out.push({ kind: "info", pri: 6, title: `${MUSCLE_LABELS[m]}: nothing at long muscle lengths`, body: `Training a muscle in its stretched position grows it more. Make one ${MUSCLE_LABELS[m].toLowerCase()} exercise a deep-stretch variation, or add lengthened partials to the last set.`, cite: "Wolf et al. 2025", muscles: [m] });
    }

    // 5) Strength — heavy exposure + frequency on your strength lifts.
    const recent42 = workoutsWithin(42, now);
    const liftStats = {};
    for (const w of recent42) for (const e of w.exercises) {
      const ex = exerciseById(e.exerciseId);
      if (!ex) continue;
      const ws = workingSets(e);
      if (!ws.length) continue;
      const st = (liftStats[ex.id] = liftStats[ex.id] || { ex, low: 0, sessions28: 0, lastHeavy: 0 });
      st.low += ws.filter((s) => s.reps <= 6).length;
      if (new Date(w.date).getTime() >= now - 28 * 86400000) st.sessions28++;
    }
    for (const st of Object.values(liftStats)) {
      const d = difficultyInfo(st.ex);
      if (st.low < 3 || !d || d.points < 5) continue;
      const best = bestE1rmAllTime(st.ex.id);
      if (!(best > 0)) continue;
      for (const w of recent42) {
        const e = w.exercises.find((x) => x.exerciseId === st.ex.id);
        if (!e) continue;
        if (workingSets(e).some((s) => effectiveLoad(s, st.ex) >= COACH_HEAVY_PCT * best)) st.lastHeavy = Math.max(st.lastHeavy, new Date(w.date).getTime());
      }
      const daysSince = st.lastHeavy ? (now - st.lastHeavy) / 86400000 : 99;
      if (!easyWeek && daysSince > 14) {
        out.push({ kind: "warn", pri: 2, title: `${st.ex.name}: no heavy work in ${daysSince >= 42 ? "6+ weeks" : Math.floor(daysSince) + " days"}`, body: `Strength comes from regular heavy exposure. Get at least a few sets at or above ${Math.round(COACH_HEAVY_PCT * best)} lb (80% of your ${Math.round(best)} e1RM) each week, at RPE 7–9.`, cite: "Lopez et al. 2021", muscles: exerciseMuscles(st.ex).p });
      }
      const freq = st.sessions28 / Math.min(4, weeks);
      if (st.sessions28 >= 2 && freq < 1.5 && d.points >= 7) {
        out.push({ kind: "info", pri: 5, title: `${st.ex.name} ~${freq.toFixed(1)}×/week`, body: "Unlike muscle growth, strength gains rise with how often you practice a lift. Splitting the same sets across two sessions a week is a cheap win.", cite: "Pelland et al. 2024", muscles: exerciseMuscles(st.ex).p });
      }
    }

    // 6) Stalls — e1RM flat across the last 3 sessions vs. before (8 weeks).
    if (!easyWeek) {
      const programLifts = [];
      const series = {};
      for (const w of workoutsWithin(56, now).slice().reverse()) for (const e of w.exercises) {
        if (programLifts.includes(e.exerciseId)) continue;
        let best = 0;
        for (const s of workingSets(e)) if (s.reps <= 12 && s.weight > 0) best = Math.max(best, estOneRm(s.weight, s.reps));
        if (best > 0) (series[e.exerciseId] = series[e.exerciseId] || []).push({ t: new Date(w.date).getTime(), v: best });
      }
      const stalls = [];
      for (const [id, arr] of Object.entries(series)) {
        if (arr.length < 5 || arr[arr.length - 1].t - arr[0].t < 21 * 86400000) continue;
        const prior = Math.max(...arr.slice(0, -3).map((x) => x.v));
        const last3 = Math.max(...arr.slice(-3).map((x) => x.v));
        if (last3 <= prior * 1.005) stalls.push(exerciseById(id));
      }
      if (stalls.length) {
        out.push({ kind: "suggest", pri: 3, title: `Stalled: ${stalls.slice(0, 3).map((x) => x.name).join(", ")}${stalls.length > 3 ? ` +${stalls.length - 3}` : ""}`, body: "No e1RM progress in your last 3 sessions. In order: make sure the last set really ends 0–2 RIR, add a set, then shift the rep range (e.g. 6–8 to 10–12) or swap to a close variation at a block boundary.", cite: "Kassiano 2022; Robinson et al. 2024", muscles: [...new Set(stalls.flatMap((x) => exerciseMuscles(x).p))] });
      }
    }

    // 7) Rest timer.
    if (state.settings.restTimerEnabled && (state.settings.restTimerSec || 120) < 90) {
      out.push({ kind: "info", pri: 6, title: `Rest timer is ${state.settings.restTimerSec}s`, body: "More than ~60–90 s between sets slightly favours growth; heavy strength sets want 3–5 min.", cite: "Singer et al. 2024", muscles: [] });
    }

    if (easyWeek) out.push({ kind: "info", pri: 4, title: `${block} week: volume and effort checks paused`, body: "Lower volume and easier sets are the point this week. The coach picks back up next week.", cite: null, muscles: [] });
    const ord = { warn: 0, suggest: 1, good: 2, info: 3 };
    return out.sort((a, b) => ord[a.kind] - ord[b.kind] || (a.pri || 9) - (b.pri || 9));
  }

  function trainingInsightCardHtml(i) {
    return `
      <div class="suggest-card card-tap ${i.kind === "good" ? "" : "suggest-hold"} coach-${i.kind}" data-action="go-analytics">
        <span class="suggest-icon">${i.kind === "warn" ? "!" : i.kind === "suggest" ? "+" : i.kind === "good" ? "▲" : "→"}</span>
        <div style="flex:1; min-width:0;">
          <div class="suggest-title">${escapeHtml(i.title)}</div>
          <div class="tiny muted">${escapeHtml(i.body)}</div>
          ${i.cite ? `<div class="coach-cite">${escapeHtml(i.cite)}</div>` : ""}
        </div>
      </div>`;
  }

  function renderTrainingCoachHtml(opts = {}) {
    const all = trainingInsights();
    let list = all;
    if (opts.muscles) list = all.filter((i) => i.muscles.some((m) => opts.muscles.includes(m)) && i.kind !== "info");
    if (opts.limit) list = list.slice(0, opts.limit);
    if (!list.length && !opts.alwaysShow) return "";
    return `
      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">${escapeHtml(opts.title || "Training coach")}</h3>
          ${opts.more && all.length > list.length ? `<button class="link-btn small" data-action="go-analytics">All ${all.length} ›</button>` : ""}
        </div>
        ${list.length ? list.map(trainingInsightCardHtml).join("") : `<div class="card small muted">Nothing to flag. Volume, effort and exercise mix all look on track.</div>`}
        ${opts.askClaude ? askClaudeButtonHtml() : ""}
      </div>`;
  }

  // ===== Suggested weekly workouts (replaces the 16-week program) =====
  // Every week the app writes a fresh powerbuilding plan from your own
  // history, using the same research rules as the coach:
  //  • Days/week = what you've actually been training (median of the last
  //    8 weeks, 3–6).
  //  • Squat + bench twice a week each: one heavy day (top triple ~87% e1RM
  //    + back-offs) and one volume day — strength responds to frequency and
  //    heavy exposure (Pelland 2024; Lopez 2021). Squat back-offs never go
  //    past 4×5 (TRAINING_RULES.squatVolume).
  //  • Accessories fill each muscle to its weekly fractional-set target
  //    (Pelland 2024), ramping up gradually from what you've been doing,
  //    split across ≥2 days and capped ~11 sets per muscle per session
  //    (Remmert 2025), covering the movement types each muscle needs
  //    (overhead triceps, knee extension, seated curls, laterals…).
  //  • Exercises you already do are preferred, so loads progress by double
  //    progression from your last session; new picks start blank.
  //  • Hinges, unsupported rows and loaded spinal flexion are never picked
  //    while TRAINING_RULES.hinge stands.
  //  • After 4 straight hard weeks the next week is a deload (half sets,
  //    mains ~65%, RPE ≤ 6).
  // The plan is built from history BEFORE this week's Monday, so it stays
  // put while you train through the week; finished days get ticked off.
  const SUGGEST_GROUPS = {
    lower: ["quads", "hamstrings", "glutes", "calves", "abs"],
    upper: ["chest", "lats", "upperBack", "frontDelts", "sideDelts", "rearDelts", "biceps", "triceps"],
    push: ["chest", "frontDelts", "sideDelts", "triceps"],
    pull: ["lats", "upperBack", "rearDelts", "biceps", "abs"],
    arms: ["lats", "upperBack", "rearDelts", "biceps", "triceps", "sideDelts"],
    full: ["quads", "hamstrings", "glutes", "chest", "lats", "upperBack", "sideDelts", "rearDelts", "biceps", "triceps", "calves", "abs"],
  };
  const SUGGEST_SPLITS = {
    3: { name: "full-body", days: [
      { key: "A", label: "Full body A", main: { squat: "heavy", bench: "volume" }, group: "full" },
      { key: "B", label: "Full body B", main: { bench: "heavy" }, group: "full" },
      { key: "C", label: "Full body C", main: { squat: "volume" }, group: "full" },
    ] },
    4: { name: "upper/lower", days: [
      { key: "LA", label: "Lower A · heavy squat", main: { squat: "heavy" }, group: "lower" },
      { key: "UA", label: "Upper A · heavy bench", main: { bench: "heavy" }, group: "upper" },
      { key: "LB", label: "Lower B · squat volume", main: { squat: "volume" }, group: "lower" },
      { key: "UB", label: "Upper B · bench volume", main: { bench: "volume" }, group: "upper" },
    ] },
    5: { name: "powerbuilding", days: [
      { key: "LA", label: "Lower A · heavy squat", main: { squat: "heavy" }, group: "lower" },
      { key: "UA", label: "Upper A · heavy bench", main: { bench: "heavy" }, group: "upper" },
      { key: "PA", label: "Pull + arms", main: {}, group: "arms" },
      { key: "LB", label: "Lower B · squat volume", main: { squat: "volume" }, group: "lower" },
      { key: "UB", label: "Upper B · bench volume", main: { bench: "volume" }, group: "upper" },
    ] },
    6: { name: "push/pull/legs", days: [
      { key: "PU1", label: "Push A · heavy bench", main: { bench: "heavy" }, group: "push" },
      { key: "PL1", label: "Pull A", main: {}, group: "pull" },
      { key: "LG1", label: "Legs A · heavy squat", main: { squat: "heavy" }, group: "lower" },
      { key: "PU2", label: "Push B · bench volume", main: { bench: "volume" }, group: "push" },
      { key: "PL2", label: "Pull B", main: {}, group: "pull" },
      { key: "LG2", label: "Legs B · squat volume", main: { squat: "volume" }, group: "lower" },
    ] },
  };
  const MAIN_LIFT_IDS = { squat: "squat", bench: "barbell-bench-press" };
  // Movement types each muscle should cover over the week, in priority order.
  const SUGGEST_TYPES = {
    quads: ["quads:squat", "quads:knee-ext"], hamstrings: ["hams:knee-flex", "hams:hinge"], glutes: ["glutes:hip-ext"],
    chest: ["chest:press", "chest:fly"], lats: ["back:vertical"], upperBack: ["back:horizontal"],
    sideDelts: ["delts:lateral"], rearDelts: ["delts:rear"], frontDelts: ["delts:overhead"],
    triceps: ["triceps:overhead", "triceps:extension"], biceps: ["biceps:stretch", "biceps:curl"],
    calves: ["calves:straight", "calves:bent"], abs: ["abs:anti", "abs:flexion"],
  };
  // Fallback picks (in order) when you've never done anything of that type.
  const SUGGEST_DEFAULTS = {
    "quads:squat": ["leg-press", "hack-squat", "belt-squat"], "quads:knee-ext": ["leg-extension"],
    "hams:knee-flex": ["seated-leg-curl", "leg-curl"], "hams:hinge": ["romanian-deadlift"], "glutes:hip-ext": ["hip-thrust", "bulgarian-split-squat"],
    "chest:press": ["incline-dumbbell-press", "machine-chest-press", "dumbbell-bench-press"], "chest:fly": ["cable-crossover", "pec-deck-fly", "dumbbell-fly"],
    "back:vertical": ["lat-pulldown", "pull-up"], "back:horizontal": ["chest-supported-row", "seated-cable-row", "machine-row"],
    "delts:lateral": ["cable-lateral-raise", "lateral-raise"], "delts:rear": ["reverse-pec-deck", "face-pull"], "delts:overhead": ["machine-shoulder-press", "seated-dumbbell-press"],
    "triceps:overhead": ["overhead-cable-extension", "overhead-triceps-extension"], "triceps:extension": ["rope-pushdown", "triceps-pushdown"],
    "biceps:stretch": ["incline-dumbbell-curl", "preacher-curl"], "biceps:curl": ["cable-curl", "dumbbell-curl", "hammer-curl"],
    "calves:straight": ["calf-raise", "leg-press-calf-raise"], "calves:bent": ["seated-calf-raise"],
    "abs:anti": ["pallof-press", "dead-bug", "plank"], "abs:flexion": ["cable-crunch"],
  };
  const SUGGEST_ORDER = ["quads", "hamstrings", "glutes", "chest", "upperBack", "lats", "sideDelts", "rearDelts", "triceps", "biceps", "calves", "abs", "frontDelts"];
  // Exercises the back rule rules out (hinges, unsupported rows, loaded flexion).
  const HINGE_BLOCKED = new Set(["deadlift", "sumo-deadlift", "deficit-deadlift", "rack-pull", "trap-bar-deadlift", "romanian-deadlift", "good-morning",
    "hyperextension", "barbell-row", "pendlay-row", "t-bar-row", "kettlebell-swing", "power-clean", "clean-and-jerk", "snatch", "thruster",
    "sit-up", "decline-sit-up", "crunch", "bicycle-crunch", "v-up", "cable-crunch", "weighted-crunch-machine", "russian-twist", "hanging-leg-raise", "toes-to-bar", "mountain-climber"]);

  function exerciseAllowed(id) {
    if (TRAINING_RULES.hinge && HINGE_BLOCKED.has(id)) return false;
    return true;
  }

  function mondayOf(ms) {
    const d = new Date(ms); const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function roundLoad(lb, step = 5) { return lb > 0 ? Math.max(step, Math.round(lb / step) * step) : ""; }

  // Recent best e1RM (RPE-adjusted when RPE was logged), last 8 weeks before `before`.
  function recentE1rm(exerciseId, before, weeks = 8) {
    let best = 0;
    for (const w of state.workouts) {
      const t = new Date(w.date).getTime();
      if (t >= before || t < before - weeks * 7 * 86400000) continue;
      for (const e of w.exercises) {
        if (e.exerciseId !== exerciseId) continue;
        for (const s of workingSets(e)) {
          if (!(s.weight > 0) || s.reps > 12) continue;
          const rir = s.type === "failure" ? 0 : (typeof s.rpe === "number" && s.rpe > 0 ? Math.max(0, 10 - s.rpe) : 0);
          best = Math.max(best, estOneRm(s.weight, Math.min(12, s.reps + rir)));
        }
      }
    }
    return best || bestE1rmAllTime(exerciseId);
  }

  // Double progression: last session's working sets → next target load.
  function nextLoadFor(ex, repHi, before) {
    let last = null;
    for (const w of state.workouts) {
      if (new Date(w.date).getTime() >= before) continue;
      const e = w.exercises.find((x) => x.exerciseId === ex.id);
      if (e && workingSets(e).length) { last = workingSets(e); break; }
    }
    if (!last) return { weight: "", note: "New pick — start with a weight you could do for ~2 more reps." };
    const top = Math.max(...last.map((s) => s.weight || 0));
    if (!(top > 0)) return { weight: "", note: "" };
    const atTop = last.filter((s) => (s.weight || 0) === top).every((s) => s.reps >= repHi);
    const d = difficultyInfo(ex);
    const inc = ex.equipment === "Bodyweight" ? 0 : d && d.parts && d.parts.m === 3 ? 10 : 5;
    return atTop && inc
      ? { weight: top + inc, note: `Hit ${repHi}s last time — up ${inc} lb.` }
      : { weight: top, note: `Same weight as last time; beat your reps.` };
  }

  let _suggestMemo = null;
  function suggestedWeek(nowMs = Date.now()) {
    const weekStart = mondayOf(nowMs);
    const prior = state.workouts.filter((w) => new Date(w.date).getTime() < weekStart);
    const memoKey = weekStart + ":" + prior.length + ":" + (prior[0] ? prior[0].id : "");
    if (_suggestMemo && _suggestMemo.key === memoKey) return _suggestMemo.value;

    // --- days per week: median sessions/week over the last 8 weeks with any training
    const counts = [];
    for (let k = 1; k <= 8; k++) {
      const a = weekStart - k * 7 * 86400000, b = a + 7 * 86400000;
      const days = new Set(prior.filter((w) => { const t = new Date(w.date).getTime(); return t >= a && t < b; }).map((w) => new Date(w.date).toDateString()));
      if (days.size) counts.push(days.size);
    }
    counts.sort((x, y) => x - y);
    const median = counts.length ? counts[Math.floor((counts.length - 1) / 2)] : 4;
    const nDays = Math.max(3, Math.min(6, Math.round(counts.length >= 2 ? median : 4)));
    const split = SUGGEST_SPLITS[nDays];

    // --- deload: 4+ consecutive hard weeks right before this one
    const weekSets = [];
    for (let k = 1; k <= 8; k++) {
      const a = weekStart - k * 7 * 86400000, b = a + 7 * 86400000;
      weekSets.push(prior.filter((w) => { const t = new Date(w.date).getTime(); return t >= a && t < b; })
        .reduce((n, w) => n + w.exercises.reduce((m, e) => m + workingSets(e).length, 0), 0));
    }
    const avgSets = weekSets.filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, weekSets.filter((x) => x > 0).length);
    let hardStreak = 0;
    for (const n of weekSets) { if (n > 0 && n >= 0.6 * avgSets) hardStreak++; else break; }
    const deload = hardStreak >= 4;

    // --- historical weekly volume per muscle (last 4 weeks before Monday)
    const last4 = prior.filter((w) => new Date(w.date).getTime() >= weekStart - 28 * 86400000);
    const histWeeks = last4.length ? Math.max(1, Math.min(4, (weekStart - Math.min(...last4.map((w) => new Date(w.date).getTime()))) / (7 * 86400000))) : 1;
    const hist = fractionalVolume(last4).total;
    const usage = {};
    for (const w of prior.filter((w) => new Date(w.date).getTime() >= weekStart - 84 * 86400000)) for (const e of w.exercises) {
      if (workingSets(e).length) usage[e.exerciseId] = (usage[e.exerciseId] || 0) + 1;
    }

    const days = split.days.map((d) => ({ ...d, exercises: [], load: {} }));
    const addLoad = (day, ex, sets) => {
      const mm = exerciseMuscles(ex);
      mm.p.forEach((m) => { day.load[m] = (day.load[m] || 0) + sets; });
      mm.s.forEach((m) => { if (!mm.p.includes(m)) day.load[m] = (day.load[m] || 0) + sets * 0.5; });
    };
    const scale = deload ? 0.5 : 1;

    // --- main lifts
    const e1rm = {};
    for (const [lift, id] of Object.entries(MAIN_LIFT_IDS)) e1rm[lift] = recentE1rm(id, weekStart);
    for (const day of days) {
      for (const [lift, role] of Object.entries(day.main)) {
        const ex = exerciseById(MAIN_LIFT_IDS[lift]);
        const base = e1rm[lift];
        const w = (pct) => (base > 0 ? roundLoad(base * pct) : "");
        let sets, note;
        if (deload) {
          sets = Array.from({ length: 3 }, () => ({ weight: w(0.65), reps: 5 }));
          note = "Deload: 3×5 @ ~65%, RPE ≤ 6. Smooth reps, nothing to prove.";
        } else if (role === "heavy") {
          sets = [{ weight: w(0.87), reps: 3 }, ...Array.from({ length: lift === "squat" ? 3 : 3 }, () => ({ weight: w(lift === "squat" ? 0.76 : 0.78), reps: 5 }))];
          note = `Top triple ~87% (RPE 8), then back-offs at RPE 7–8.${base > 0 ? ` Based on e1RM ${Math.round(base)}.` : ""}`;
        } else {
          const n = lift === "squat" ? 4 : 4;
          sets = Array.from({ length: n }, () => ({ weight: w(lift === "squat" ? 0.72 : 0.72), reps: lift === "squat" ? 5 : 6 }));
          note = lift === "squat" ? "Volume day: 4×5 is the cap. Add quad work on machines, not more squats." : "Volume day: 4×6 at RPE 7–8, last set can go to 8.5.";
        }
        day.exercises.push({ exerciseId: ex.id, sets, note, kind: "main", reason: deload ? "Deload: keep the groove, shed fatigue" : role === "heavy" ? "Heavy exposure for strength" : "Second weekly exposure (frequency)" });
        addLoad(day, ex, sets.length);
      }
    }

    // --- accessory targets + allocation
    const targets = {};
    for (const m of SUGGEST_ORDER) {
      const [lo, hi] = MUSCLE_TARGETS[m];
      const h = (hist[m] || 0) / histWeeks;
      const aimBase = Math.round(lo + (hi - lo) * 0.35);
      let aim = h < lo ? Math.max(lo, Math.min(aimBase, h + 6)) : Math.min(hi, Math.max(aimBase, Math.round(h)));
      if (m === "frontDelts") aim = lo;
      targets[m] = { aim: aim * scale, hist: h };
    }
    const weekLoad = () => {
      const t = {};
      for (const d of days) for (const [m, v] of Object.entries(d.load)) t[m] = (t[m] || 0) + v;
      return t;
    };
    const pickExercise = (muscle, type, day) => {
      const used = new Set(day.exercises.map((e) => e.exerciseId));
      const cands = DEFAULT_EXERCISES.filter((e) => {
        const mm = EXERCISE_MUSCLES[e.id];
        return mm && mm.p.includes(muscle) && mm.t.includes(type) && exerciseAllowed(e.id) && !used.has(e.id) && !Object.values(MAIN_LIFT_IDS).includes(e.id);
      });
      if (!cands.length) return null;
      const defs = SUGGEST_DEFAULTS[type] || [];
      cands.sort((a, b) => ((usage[b.id] || 0) - (usage[a.id] || 0))
        || ((defs.indexOf(a.id) === -1 ? 99 : defs.indexOf(a.id)) - (defs.indexOf(b.id) === -1 ? 99 : defs.indexOf(b.id))));
      return cands[0];
    };
    for (const m of SUGGEST_ORDER) {
      const mDays = days.filter((d) => SUGGEST_GROUPS[d.group].includes(m));
      if (!mDays.length) continue;
      let remaining = targets[m].aim - (weekLoad()[m] || 0);
      if (remaining < 1.5) continue;
      const types = (SUGGEST_TYPES[m] || []).filter((t) => !(TRAINING_RULES.hinge && (t === "hams:hinge" || t === "abs:flexion")));
      const useDays = mDays.slice(0, Math.max(1, Math.min(mDays.length, remaining >= 5 ? 3 : 1)));
      let ti = 0;
      for (let di = 0; di < useDays.length && remaining >= 1.5; di++) {
        const day = useDays[di];
        let chunk = Math.ceil(remaining / (useDays.length - di));
        chunk = Math.min(chunk, Math.floor(COACH_SESSION_CAP - (day.load[m] || 0)));
        if (chunk < 2) continue;
        const nEx = chunk >= 6 && types.length > 1 ? 2 : 1;
        for (let k = 0; k < nEx; k++) {
          const type = types[(ti++) % Math.max(1, types.length)];
          const ex = type && pickExercise(m, type, day);
          if (!ex) continue;
          const sets = Math.max(2, Math.min(4, Math.round(chunk / nEx)));
          const d = difficultyInfo(ex);
          const compound = d && d.parts ? d.parts.m >= 2 : false;
          const [rLo, rHi] = m === "quads" && compound ? [8, 12] : compound ? [6, 10] : [10, 15];
          const ld = nextLoadFor(ex, rHi, weekStart);
          const reason = (targets[m].hist < MUSCLE_TARGETS[m][0] ? `${MUSCLE_LABELS[m]} ${targets[m].hist.toFixed(0)} → ${Math.round(targets[m].aim)} sets/wk` : `${MUSCLE_LABELS[m]} volume`)
            + (type && /overhead|knee-ext|knee-flex|lateral|stretch|fly|rear|bent/.test(type) && !usage[ex.id] ? " · covers a neglected movement" : "");
          day.exercises.push({
            exerciseId: ex.id, kind: compound ? "compound" : "isolation",
            sets: Array.from({ length: Math.max(1, Math.round(sets * (deload ? 1 : 1))) }, () => ({ weight: ld.weight, reps: rHi })),
            repRange: [rLo, rHi],
            note: `${rLo}–${rHi} reps, last set ${deload ? "RPE ≤ 6" : "0–2 reps in reserve"}. ${ld.note}`.trim(),
            reason,
          });
          addLoad(day, ex, sets);
          remaining -= sets;
        }
      }
      // Leftover pass: top up this muscle's picks a set at a time (max 5
      // sets per exercise, never past the per-session cap) until the weekly
      // target is met.
      let guard = 0;
      while (remaining >= 1 && guard++ < 12) {
        let bumped = false;
        for (const day of useDays) {
          if (remaining < 1) break;
          const e = day.exercises.find((x) => x.kind !== "main" && exerciseMuscles(exerciseById(x.exerciseId)).p[0] === m && x.sets.length < 5);
          if (!e || (day.load[m] || 0) + 1 > COACH_SESSION_CAP) continue;
          e.sets.push({ ...e.sets[e.sets.length - 1] });
          addLoad(day, exerciseById(e.exerciseId), 1);
          remaining -= 1; bumped = true;
        }
        if (!bumped) break;
      }
    }
    // order: mains, compounds (by difficulty), isolation
    const rank = { main: 0, compound: 1, isolation: 2 };
    for (const d of days) d.exercises.sort((a, b) => rank[a.kind] - rank[b.kind] || (difficultyInfo(exerciseById(b.exerciseId)).points - difficultyInfo(exerciseById(a.exerciseId)).points));

    const value = {
      weekStart, weekKey: new Date(weekStart).toISOString().slice(0, 10), splitName: split.name, deload, hardStreak,
      e1rm, targets, days, basedOnWeeks: counts.length,
    };
    _suggestMemo = { key: memoKey, value };
    return value;
  }

  // Suggested-weekly-workouts UI was removed 2026-10-22 at Alex's request.
  // suggestedWeek() itself stays (below) — buildClaudeExport() still reads
  // it for plan context — but nothing renders it as a workout to start.

  // ===== Ask Claude (copy-paste hand-off, no API) =====
  function askClaudeButtonHtml() {
    return `
      <div class="ask-claude">
        <button class="btn" data-action="ask-claude">Ask Claude: copy my training data</button>
        <div class="tiny muted" style="margin-top:6px;">Copies a full summary (profile, last 4 weeks of sets, volume per muscle, strength levels, coach flags) to paste into a Claude chat.</div>
      </div>`;
  }

  function buildClaudeExport() {
    const L = [];
    const bw = bodyWeightOn();
    const h = state.settings.heightIn;
    L.push("I track my lifting in my app (Just Lift). Act as my strength and hypertrophy coach. Using the data below and current evidence-based training research, tell me:");
    L.push("1) what's going well, 2) what I'm under- or over-doing per muscle, 3) whether I'm pushing hard enough, 4) exercises I'm neglecting, and 5) exactly what to change next week. Respect my program constraints listed below.");
    L.push("");
    L.push("## Me");
    L.push(`- Male${bw ? `, ${Math.round(bw)} lb` : ""}${h ? `, ${Math.floor(h / 12)}'${Math.round(h % 12)}"` : ""}`);
    const sw = (() => { try { return suggestedWeek(); } catch (e) { return null; } })();
    if (sw) L.push(`- Plan: app-suggested ${sw.days.length}-day ${sw.splitName} week${sw.deload ? " (deload week)" : ""}; e1RMs used: ${Object.entries(sw.e1rm).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}`);
    const r = programRules();
    const cons = ["hinge", "squatVolume", "shoulder", "perSession"].filter((k) => r[k]);
    if (cons.length) { L.push("- Constraints:"); cons.forEach((k) => L.push(`  - ${k}: ${r[k]}`)); }
    L.push("");
    const recent = workoutsWithin(28);
    const earliest = recent.length ? Math.min(...recent.map((w) => new Date(w.date).getTime())) : Date.now();
    const weeks = Math.max(1, Math.min(4, (Date.now() - earliest) / (7 * 86400000) + 1 / 7));
    const vol = fractionalVolume(recent);
    L.push(`## Weekly fractional sets per muscle (last ${weeks.toFixed(1)} wk; primary 1, secondary 0.5)`);
    Object.keys(MUSCLE_LABELS).forEach((m) => { const v = (vol.total[m] || 0) / weeks; if (v > 0 || MUSCLE_TARGETS[m]) L.push(`- ${MUSCLE_LABELS[m]}: ${v.toFixed(1)}${MUSCLE_TARGETS[m] ? ` (target ${MUSCLE_TARGETS[m][0]}–${MUSCLE_TARGETS[m][1]})` : ""}`); });
    L.push("");
    const ids = new Set(); state.workouts.forEach((w) => w.exercises.forEach((e) => ids.add(e.exerciseId)));
    const ranks = [...ids].map((id) => ({ ex: exerciseById(id), r: bestStrengthRank(id) })).filter((x) => x.ex && x.r).sort((a, b) => b.r.pctl - a.r.pctl);
    if (ranks.length) {
      L.push("## Strength levels (best set vs strengthlevel.com male standards at my bodyweight)");
      ranks.forEach(({ ex, r: k }) => L.push(`- ${ex.name}: ${k.level}, ~${Math.round(k.pctl)}th pct (best ${k.set.weight}×${k.set.reps}${k.unit === "lb" ? `, e1RM ${Math.round(k.value)}` : ""})`));
      L.push("");
    }
    const ins = trainingInsights();
    if (ins.length) { L.push("## My app's coach flags"); ins.forEach((i) => L.push(`- [${i.kind}] ${i.title}: ${i.body}`)); L.push(""); }
    L.push("## Workouts, last 4 weeks (weight lb × reps @RPE; W = warm-up)");
    recent.slice().reverse().forEach((w) => {
      L.push(`### ${new Date(w.date).toISOString().slice(0, 10)} · ${w.name}${typeof w.effortScore === "number" ? ` · effort ${w.effortScore}%` : ""}${w.durationSec ? ` · ${Math.round(w.durationSec / 60)} min` : ""}`);
      w.exercises.forEach((e) => {
        const sets = e.sets.filter((s) => s.completed).map((s) => `${s.isWarmup ? "W " : ""}${s.weight || 0}×${s.reps}${typeof s.rpe === "number" ? `@${s.rpe}` : ""}${s.type === "failure" ? " (fail)" : ""}`);
        if (sets.length) L.push(`- ${e.name}: ${sets.join(", ")}`);
      });
    });
    return L.join("\n");
  }

  async function copyClaudeExport() {
    const text = buildClaudeExport();
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch (e) { ok = false; }
    }
    showAskClaudeSheet(text, ok);
  }

  function showAskClaudeSheet(text, copied) {
    const wrap = document.createElement("div");
    wrap.className = "ask-sheet-backdrop";
    wrap.innerHTML = `
      <div class="ask-sheet" role="dialog" aria-label="Ask Claude">
        <div class="suggest-title">${copied ? "Copied. Paste it into Claude." : "Copy this, then paste it into Claude"}</div>
        <div class="tiny muted" style="margin:4px 0 10px;">${text.length.toLocaleString()} characters. Nothing is sent anywhere; it's only on your clipboard.</div>
        <textarea class="ask-text" readonly>${escapeHtml(text)}</textarea>
        <a class="btn btn-primary" href="https://claude.ai/new" target="_blank" rel="noopener" style="margin-top:10px; display:block; text-align:center;">Open Claude</a>
        <button class="btn" data-ask-close style="margin-top:8px;">Close</button>
      </div>`;
    wrap.addEventListener("click", (ev) => { if (ev.target === wrap || ev.target.hasAttribute("data-ask-close")) wrap.remove(); });
    document.body.appendChild(wrap);
    if (!copied) { const ta = wrap.querySelector(".ask-text"); ta.focus(); ta.select(); }
  }

  // Five-segment ladder with a marker at the lifter's percentile.
  function levelLadderHtml(r) {
    const segs = [[0, 5], [5, 20], [20, 50], [50, 80], [80, 95], [95, 100]];
    return `
      <div class="lvl-ladder">
        ${segs.map(([a, b], i) => `<span class="lvl-seg lvl-seg-${i}" style="width:${b - a}%"></span>`).join("")}
        <span class="lvl-marker" style="left:${Math.min(99, Math.max(1, r.pctl)).toFixed(1)}%"></span>
      </div>
      <div class="lvl-ticks tiny muted">
        ${STRENGTH_LEVELS.map((l, i) => `<span style="left:${STRENGTH_LEVEL_PCTL[i]}%">${l.slice(0, 3)}<br>${rankValueLabel(r, r.thresholds[i]).replace(" reps", "").replace(" " + unitLabel(), "")}</span>`).join("")}
      </div>`;
  }

  // Range-of-motion adjustment for height: a taller lifter's limbs travel
  // farther per rep on compound lifts (deeper squat, longer pull, longer
  // press arc), so the same weight x reps represents more actual work.
  // Reference height is ~5'8" (68in, roughly average adult height) = no
  // adjustment. Only movements whose ROM plausibly scales with height get
  // adjusted at all, and isolation lifts (fixed joint ROM regardless of
  // height) are left untouched. Leaving height blank in Settings also
  // leaves this at a neutral 1.0 — it's a bonus adjustment, not a
  // requirement.
  const HEIGHT_REFERENCE_IN = 68;
  const HEIGHT_ROM_PER_INCH = 0.005;

  function heightRomFactor(ex, heightIn) {
    if (!heightIn) return 1.0;
    // Library lifts use their difficulty profile: lower/full-body compounds
    // (m=3) scale fully with height, upper-body compounds (m=2, longer arm
    // path) at 0.6, single-joint isolation (m=1, fixed joint angle) not at
    // all. Custom exercises fall back to the name-keyword tier.
    const d = ex && typeof EXERCISE_DIFFICULTY !== "undefined" ? EXERCISE_DIFFICULTY[ex.id] : null;
    let sensitivity;
    if (d) sensitivity = d.m === 3 ? 1 : d.m === 2 ? 0.6 : 0;
    else {
      const tier = movementTier(ex ? ex.name : "");
      sensitivity = tier === "veryHigh" ? 1 : tier === "high" ? 0.7 : 0;
    }
    if (sensitivity === 0) return 1.0;
    const raw = 1 + (heightIn - HEIGHT_REFERENCE_IN) * HEIGHT_ROM_PER_INCH * sensitivity;
    return Math.max(0.85, Math.min(1.15, raw));
  }

  // Body mass moved: on lifts where your own body travels with the bar
  // (squats, lunges, hinges, cleans, standing calf raises…), the real load
  // per rep is the bar PLUS that share of your bodyweight — the "system
  // mass" used in biomechanics (work ≈ system mass × ROM). So the same
  // 315 × 5 squat is more total work for a 240 lb lifter than a 160 lb
  // one, and a light set is relatively more body than bar. Fractions are
  // standard segment-mass approximations (shanks/feet stay put in a squat
  // ≈ 0.85 of BW rises; a hinge moves the torso/arms/head ≈ 0.5).
  // Scored relative to a 180 lb reference lifter so the average lifter
  // reads as 1.0. Bodyweight-equipment lifts already count full BW as the
  // load (effectiveLoad), so they're left at 1.0 here — no double count.
  const BODY_MASS_FRACTION = {
    "squat": 0.85, "front-squat": 0.85, "pause-squat": 0.85, "box-squat": 0.85, "zercher-squat": 0.85,
    "goblet-squat": 0.85, "sumo-squat": 0.85, "hack-squat": 0.85, "belt-squat": 0.85,
    "walking-lunge": 0.85, "reverse-lunge": 0.85, "step-up": 0.85, "bulgarian-split-squat": 0.85,
    "thruster": 0.85, "power-clean": 0.7, "clean-and-jerk": 0.85, "snatch": 0.85,
    "deadlift": 0.5, "sumo-deadlift": 0.5, "deficit-deadlift": 0.5, "trap-bar-deadlift": 0.55, "rack-pull": 0.35,
    "romanian-deadlift": 0.5, "good-morning": 0.5, "kettlebell-swing": 0.35, "hip-thrust": 0.4,
    "push-press": 0.3, "calf-raise": 0.95, "smith-machine-calf-raise": 0.95,
  };
  const BODY_MASS_REFERENCE_LB = 180;

  function bodyMassWorkFactor(ex, load, bodyWeight) {
    if (!ex || ex.equipment === "Bodyweight" || !(bodyWeight > 0)) return 1.0;
    const f = BODY_MASS_FRACTION[ex.id] || 0;
    if (!f) return 1.0;
    const l = Math.max(0, load || 0);
    const raw = (l + f * bodyWeight) / (l + f * BODY_MASS_REFERENCE_LB);
    return Math.max(0.8, Math.min(1.3, raw));
  }

  // Best-ever estimated 1RM for an exercise across all completed history
  // (working sets only — warmups don't count toward a PR).
  function bestE1rmAllTime(exerciseId) {
    let best = 0;
    for (const w of state.workouts) {
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!ex) continue;
      for (const s of ex.sets) {
        if (!s.completed || s.isWarmup) continue;
        const e1rm = estOneRm(s.weight || 0, s.reps);
        if (e1rm > best) best = e1rm;
      }
    }
    return best;
  }

  // Fallback body weight (lb) used for bodyweight exercises if the person
  // hasn't entered their real body weight in Settings yet.
  const DEFAULT_BODYWEIGHT_LB = 150;

  function effectiveLoad(set, ex) {
    const weight = set.weight || 0;
    if (ex && ex.equipment === "Bodyweight") {
      return weight + (currentBodyWeightLb() || DEFAULT_BODYWEIGHT_LB);
    }
    return weight;
  }

  // ===== Effort model (v5) — three established training-load axes,
  // each scored against fixed, published reference points instead of
  // your own personal-best session =====
  //
  // v4 normalized every axis against "your best prior session on that
  // axis," which sounds sensible but backfires in practice: RPE and %1RM
  // are *already* self-relative (RPE is defined relative to your own
  // effort, %1RM relative to your own max), so dividing by your single
  // best-ever session on top of that meant only your literal lifetime-peak
  // session could ever read as high effort — a completely solid, hard
  // RPE 8-9 day would read as a fraction of that one outlier and land
  // in the 30s. This version keeps the same three signals but scores
  // each one against the field's own published bands, so a genuinely
  // hard session reads as hard on its own terms, every time:
  //
  //  1. INTENSITY — top working set's effort, on the RPE scale (Reps In
  //     Reserve). Uses your logged RPE directly when you entered one;
  //     otherwise estimates it from %1RM vs. your best e1RM using the
  //     same Epley-curve RIR estimate as before. Scored on a plain
  //     linear RPE 5→10 ramp (RPE 10 = 100, RPE 8 = 60, RPE 5 or below
  //     = 0) — the Tuchscherer/RTS RPE chart's own 5-10 working range,
  //     not a comparison to any other session.
  //
  //  2. MUSCLE / EFFECTIVE REPS — the "stimulating reps" model
  //     (Beardsley): only the ~5 reps closest to failure recruit
  //     high-threshold motor units under full mechanical tension, so
  //     each set contributes min(reps, 5 − RIR). Summed across the
  //     session and scored against ~30 total effective reps as a full,
  //     hard, multi-exercise day (a widely-used rule-of-thumb range for
  //     weekly-equivalent hard sets scaled to one session).
  //
  //  3. WORK / VOLUME — session INOL (Hristov): reps / (100 − %1RM) per
  //     set, the powerlifting community's standard intensity-adjusted
  //     volume metric. Summed across the session and scored against
  //     Hristov's own published bands (session total ~1.0 = solid
  //     working day, ~2.0+ = heavy, ~3.0 = a very taxing day).
  //
  // Blended with the same weights as before (intensity counts most,
  // since "how hard was your hardest set" is the most direct effort
  // signal), then capped by session coverage (see workoutCoverage) so a
  // one-exercise session can't read as near-total effort no matter how
  // hard that one exercise was.
  //
  //  4. STRENGTH (v6) — how heavy the session was in absolute terms, for a
  //     lifter of your size: each ranked exercise's best set placed against
  //     Strength Level's male standards AT YOUR BODYWEIGHT that day (the
  //     same "how strong for your bodyweight" idea as Wilks/DOTS, per lift).
  //     Session value = difficulty-weighted average percentile, so a heavy
  //     squat counts for more than a strong curl. Scored 0–100 directly
  //     (percentile = score). Sessions with no rankable lift (or no logged
  //     bodyweight) skip this axis and the other three re-normalize.
  //
  // Weights: the original 40/35/25 balance scaled by 0.8 to make room for
  // strength at 20% — so intensity:muscle:volume keep their ratio.
  const EFFORT_WEIGHTS = { intensity: 0.32, muscle: 0.28, volume: 0.20, strength: 0.20 };
  // Absolute reference points each axis is scored against (see comment
  // above) — not derived from this person's history, so they don't drift.
  const INTENSITY_RPE_FLOOR = 5;    // RPE at/below this scores 0
  const INTENSITY_RPE_CEIL = 10;    // RPE at/above this scores 100
  const MUSCLE_FULL_SESSION_REPS = 30; // total effective reps ≈ a full hard day
  const VOLUME_FULL_SESSION_INOL = 3;  // total session INOL ≈ a heavy/taxing day
  // %1RM assumed for a lift with no history yet, and its assumed RIR.
  const FIRST_TIME_PCT = 0.75;
  const FIRST_TIME_RIR = 2;
  // Unweighted accessories (dead bugs, planks, ab wheel logged without
  // load) are treated as moderate-intensity work a few reps from failure.
  const UNWEIGHTED_PCT = 0.6;
  const UNWEIGHTED_RIR = 3;

  // Per-set contributions to the three axes. Returns null for warmups,
  // incomplete or empty sets. `bestE1rm` = personal-best estimated 1RM for
  // this exercise (used both as the %1RM reference and to estimate RIR).
  function setEffortMetrics(set, ex, bestE1rm, bodyWeight) {
    if (!set || !set.completed || set.isWarmup) return null;
    const reps = set.reps || 0;
    if (reps <= 0) return null;
    const load = effectiveLoad(set, ex);
    const bw = bodyWeight != null ? bodyWeight : currentBodyWeightLb();
    const diff = exerciseDifficulty(ex) * heightRomFactor(ex, state.settings.heightIn) * bodyMassWorkFactor(ex, set.weight || 0, bw);
    let pct, rir;
    if (load <= 0) {
      pct = UNWEIGHTED_PCT; rir = UNWEIGHTED_RIR;
    } else if (!(bestE1rm > 0)) {
      pct = FIRST_TIME_PCT; rir = FIRST_TIME_RIR;
    } else {
      pct = Math.max(0.3, Math.min(0.975, load / bestE1rm));
      // Epley inverse: reps possible at this load given your best e1RM.
      const maxReps = 30 * (bestE1rm / load - 1);
      rir = Math.max(0, maxReps - reps);
    }
    // A logged RPE is ground truth for how close to failure the set was, so
    // it overrides the load-vs-e1RM estimate: RIR ≈ 10 − RPE. A set marked
    // "to failure" is RIR 0. This makes both the intensity (RPE) and the
    // Muscle (effective-reps) axis reflect what actually happened rather
    // than a model guess.
    if (set.type === "failure") rir = 0;
    else if (typeof set.rpe === "number" && set.rpe > 0) rir = Math.max(0, 10 - set.rpe);
    return {
      rpe: Math.max(0, Math.min(10, 10 - rir)),
      muscle: Math.max(0, Math.min(reps, 5 - rir)) * diff,
      volume: (reps / (100 - pct * 100)) * diff,
    };
  }

  // Sums the three axes over a workout. `bestFor(exerciseId)` supplies the
  // personal-best e1RM reference — live scoring uses all-time bests, the
  // history backfill uses bests-as-of-that-date.
  function workoutEffortMetrics(exercises, bestFor, dateIso) {
    const totals = { topRpe: 0, muscle: 0, volume: 0, strength: null };
    const bw = bodyWeightOn(dateIso);
    let strengthSum = 0, strengthWeight = 0;
    for (const e of exercises) {
      const ex = exerciseById(e.exerciseId);
      if (!ex) continue;
      const rank = rankSets(ex, e.sets, dateIso);
      if (rank) {
        const w = exerciseDifficulty(ex);
        strengthSum += rank.pctl * w;
        strengthWeight += w;
      }
      const best = bestFor(e.exerciseId);
      for (const s of e.sets) {
        const m = setEffortMetrics(s, ex, best, bw);
        if (!m) continue;
        // Intensity is a peak (hardest single set of the session);
        // muscle and volume accumulate.
        totals.topRpe = Math.max(totals.topRpe, m.rpe);
        totals.muscle += m.muscle;
        totals.volume += m.volume;
      }
    }
    if (strengthWeight > 0) totals.strength = strengthSum / strengthWeight;
    return totals;
  }

  // 0-100 per-axis breakdown + blended score. Each axis is scored against
  // a fixed, published reference band (see the model comment above) —
  // not against this person's own history — then capped by session
  // coverage (see workoutCoverage) so a one-exercise session can't read
  // as near-total effort no matter how heavy it was.
  function scoreEffort(metrics, coverage) {
    const intensityScore = Math.max(0, Math.min(100,
      ((metrics.topRpe - INTENSITY_RPE_FLOOR) / (INTENSITY_RPE_CEIL - INTENSITY_RPE_FLOOR)) * 100
    ));
    const muscleScore = Math.max(0, Math.min(100, (metrics.muscle / MUSCLE_FULL_SESSION_REPS) * 100));
    const volumeScore = Math.max(0, Math.min(100, (metrics.volume / VOLUME_FULL_SESSION_INOL) * 100));
    const hasStrength = typeof metrics.strength === "number";
    const strengthScore = hasStrength ? Math.max(0, Math.min(100, metrics.strength)) : null;
    const breakdown = {
      intensity: Math.round(intensityScore),
      muscle: Math.round(muscleScore),
      volume: Math.round(volumeScore),
      strength: hasStrength ? Math.round(strengthScore) : null,
    };
    const W = EFFORT_WEIGHTS;
    const totalW = W.intensity + W.muscle + W.volume + (hasStrength ? W.strength : 0);
    const blended = (
      W.intensity * (intensityScore / 100) +
      W.muscle * (muscleScore / 100) +
      W.volume * (volumeScore / 100) +
      (hasStrength ? W.strength * (strengthScore / 100) : 0)
    ) / totalW;
    const score = Math.min(Math.round(blended * 100), Math.round(coverage * 100));
    return { score, breakdown };
  }

  // How "complete" a session is, independent of how hard any single set
  // was — a single all-out exercise isn't great for overall growth the
  // way a fuller, more varied session is, so this discounts sessions that
  // are narrow in either sense:
  //   - exerciseCount: how many distinct exercises were performed
  //   - muscleGroups: how many distinct muscle groups those exercises hit
  // Both saturate (more isn't better past a normal, complete session —
  // this isn't a reward for cramming in 15 exercises), and muscle-group
  // variety is weighted higher than raw exercise count since it's the
  // more direct "different exercises worked" signal. Muscle variety
  // saturates at just TWO groups: a focused powerlifting day (squat +
  // squat variations + core, or bench + bench variations + back) is a
  // complete, legitimate session, not a partial one — only a true
  // one-exercise, one-muscle session gets discounted (~0.4).
  function workoutCoverage(exercises) {
    if (!exercises || exercises.length === 0) return 0;
    const muscles = new Set();
    for (const e of exercises) {
      const ex = exerciseById(e.exerciseId);
      if (ex) muscles.add(ex.muscle);
    }
    const countFactor = Math.min(1, exercises.length / 4);
    const muscleFactor = Math.min(1, muscles.size / 2);
    return 0.4 * countFactor + 0.6 * muscleFactor;
  }

  function effortCaption(score, hasPr, coverage) {
    if (coverage < 0.5) return "Solid work — a fuller session (more exercises or muscle groups) will push your effort score higher.";
    if (score >= 90) return "One of your hardest sessions yet.";
    if (hasPr) return "Strong work — you're getting stronger.";
    if (score < 35) return "A lighter session — recovery is progress too.";
    return "You showed up today. That's what counts.";
  }

  // Bump this whenever the effort formula changes meaningfully, so
  // existing history gets recomputed under the new rules instead of
  // being stuck with scores from an old formula (see backfillEffortScores).
  const EFFORT_SCORE_VERSION = 6;

  // One-time-per-version migration: (re)computes effort metrics/scores for
  // any workout that either predates this feature or was scored under an
  // older formula version, so history isn't left blank or inconsistent
  // with how new workouts get scored. Walked chronologically (oldest
  // first) so each workout's e1RM references only ever reflect what had
  // actually happened by that point in time — scoring itself (v5) no
  // longer depends on other workouts, just this session's own numbers.
  async function backfillEffortScores() {
    if (state.workouts.length === 0) return;
    if (state.workouts.every((w) => w.effortVersion === EFFORT_SCORE_VERSION)) return;
    const chron = [...state.workouts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const bestE1rmSoFar = {};
    for (const w of chron) {
      if (w.effortVersion !== EFFORT_SCORE_VERSION) {
        const metrics = workoutEffortMetrics(w.exercises, (id) => bestE1rmSoFar[id] || 0, w.date);
        const { score, breakdown } = scoreEffort(metrics, workoutCoverage(w.exercises));
        w.effortMetrics = metrics;
        w.effortBreakdown = breakdown;
        w.effortScore = score;
        w.effortVersion = EFFORT_SCORE_VERSION;
        await DB.put("workouts", w);
      }
      for (const e of w.exercises) {
        for (const s of e.sets) {
          if (!s.completed || s.isWarmup) continue;
          const e1rm = estOneRm(s.weight || 0, s.reps);
          if (e1rm > (bestE1rmSoFar[e.exerciseId] || 0)) bestE1rmSoFar[e.exerciseId] = e1rm;
        }
      }
    }
  }

  function startWorkout(routine) {
    const exercises = routine
      ? routine.exercises.map((re) => {
          normalizeRoutineExercise(re);
          return {
            exerciseId: re.exerciseId,
            name: exerciseById(re.exerciseId)?.name || "Exercise",
            note: re.note || "",
            sets: buildWorkoutSetsFromRoutine(re.exerciseId, re.sets),
          };
        })
      : [];
    state.activeWorkout = {
      id: uid(),
      name: routine ? routine.name : "Workout",
      routineId: routine ? routine.id : null,
      startedAt: new Date().toISOString(),
      exercises,
    };
    saveActiveWorkout();
    navigate("workout-active");
  }

  async function finishWorkout() {
    const w = state.activeWorkout;
    if (!w) return;
    const hasAnyCompleted = w.exercises.some((e) => e.sets.some((s) => s.completed));
    if (!hasAnyCompleted) {
      showToast("Log at least one set first");
      return;
    }
    const durationSec = Math.round((Date.now() - new Date(w.startedAt).getTime()) / 1000);
    const cleanExercises = w.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completed) }))
      .filter((e) => e.sets.length > 0);

    let prCount = 0;
    for (const e of cleanExercises) {
      const prevBest = bestWeightFor(e.exerciseId);
      const workingWeights = e.sets.filter((s) => !s.isWarmup).map((s) => s.weight || 0);
      const maxThis = workingWeights.length ? Math.max(...workingWeights) : 0;
      if (maxThis > prevBest) prCount++;
    }

    // Effort score must be computed while state.workouts still only holds
    // *prior* workouts (bestE1rmAllTime scans it for the %1RM reference),
    // so this has to happen before the unshift below.
    const effortMetrics = workoutEffortMetrics(cleanExercises, (id) => bestE1rmAllTime(id), w.startedAt);
    const { score: effortScore, breakdown: effortBreakdown } =
      scoreEffort(effortMetrics, workoutCoverage(cleanExercises));

    const record = {
      id: w.id,
      name: w.name,
      routineId: w.routineId,
      date: w.startedAt,
      durationSec,
      exercises: cleanExercises,
      prCount,
      effortMetrics,
      effortBreakdown,
      effortScore,
      effortVersion: EFFORT_SCORE_VERSION,
    };
    await DB.put("workouts", record);
    state.workouts.unshift(record);
    state.activeWorkout = null;
    stopWorkoutClock();
    endRestTimer(false);
    await DB.kvSet("activeWorkout", null);
    navigate("workout-complete", { id: record.id });
  }

  function discardWorkout() {
    state.activeWorkout = null;
    stopWorkoutClock();
    endRestTimer(false);
    DB.kvSet("activeWorkout", null);
    navigate("home");
  }

  // ---------- Cardio / other activities ----------
  // A lightweight second workout type alongside strength: start, let the
  // clock run, optionally log a distance, stop, and rate how hard it felt
  // (RPE) — see sessionLoad() above for how that RPE feeds the same
  // training-balance math as a lifting session.
  const ACTIVITY_TYPES = {
    run: { label: "Run", icon: "🏃" },
    walk: { label: "Walk", icon: "🚶" },
    bike: { label: "Bike", icon: "🚴" },
    swim: { label: "Swim", icon: "🏊" },
    pickleball: { label: "Pickleball", icon: "🎾" },
    basketball: { label: "Basketball", icon: "🏀" },
    other_cardio: { label: "Other cardio", icon: "🔥" },
  };
  function activityTypeLabel(type) { return (ACTIVITY_TYPES[type] || { label: "Activity" }).label; }
  function activityTypeIcon(type) { return (ACTIVITY_TYPES[type] || { icon: "🔥" }).icon; }

  function startCardioActivity(activityType) {
    if (!ACTIVITY_TYPES[activityType]) return;
    state.activeCardio = {
      id: uid(),
      activityType,
      name: activityTypeLabel(activityType),
      startedAt: new Date().toISOString(),
      distance: "",
      notes: "",
    };
    DB.kvSet("activeCardio", state.activeCardio);
    navigate("cardio-active");
  }

  function discardCardioActivity() {
    state.activeCardio = null;
    stopCardioClock();
    DB.kvSet("activeCardio", null);
    navigate("home");
  }

  // Builds + saves the activity record once an RPE has been picked (see
  // the #rpe-sheet-overlay flow below), mirroring finishWorkout()'s shape
  // (durationSec, effortScore, prCount) so History/Home can treat both
  // kinds of session uniformly wherever that's useful (allSessions()).
  async function saveCardioActivity(rpe) {
    const a = state.activeCardio;
    if (!a) return;
    const durationSec = Math.max(1, Math.round((Date.now() - new Date(a.startedAt).getTime()) / 1000));
    const record = {
      id: a.id,
      activityType: a.activityType,
      name: a.name,
      date: a.startedAt,
      durationSec,
      distance: a.distance ? parseFloat(a.distance) || null : null,
      notes: a.notes || "",
      rpe,
      // Direct RPE->percent, same 0-100 scale every other effort badge in
      // the app already uses — see sessionLoad() for how duration enters
      // the *load* side separately (intensity vs. volume, same split the
      // strength formula makes).
      effortScore: Math.round(rpe * 10),
      prCount: 0,
    };
    await DB.put("activities", record);
    state.activities.unshift(record);
    state.activeCardio = null;
    stopCardioClock();
    await DB.kvSet("activeCardio", null);
    navigate("cardio-complete", { id: record.id });
  }

  function deleteActivity(id) {
    state.activities = state.activities.filter((a) => a.id !== id);
    DB.delete("activities", id);
    navigate("history", { tab: "workouts" });
  }

  let cardioClockInterval = null;
  function startCardioClock() {
    if (cardioClockInterval) return;
    cardioClockInterval = setInterval(() => {
      const a = state.activeCardio;
      if (!a) { stopCardioClock(); return; }
      const el = document.getElementById("cardio-elapsed");
      if (!el) return;
      el.textContent = fmtTime((Date.now() - new Date(a.startedAt).getTime()) / 1000);
    }, 1000);
  }
  function stopCardioClock() {
    if (cardioClockInterval) { clearInterval(cardioClockInterval); cardioClockInterval = null; }
  }

  function renderCardioActive() {
    const a = state.activeCardio;
    if (!a) { navigate("home"); return; }
    appEl.innerHTML = `
      <div class="topbar topbar-sticky">
        <button class="back-btn" data-action="discard-cardio">Discard</button>
        <span class="workout-clock" id="cardio-elapsed">${fmtTime((Date.now() - new Date(a.startedAt).getTime()) / 1000)}</span>
        <button class="btn btn-sm btn-primary" data-action="finish-cardio">Finish</button>
      </div>
      <div class="cardio-active-icon">${activityTypeIcon(a.activityType)}</div>
      <h1 style="text-align:center;">${escapeHtml(a.name)}</h1>
      <div class="card" style="margin-top:16px;">
        <div class="row">
          <span>Distance <span class="tiny muted">(optional)</span></span>
          <div class="row-gap">
            <input type="text" inputmode="decimal" id="cardio-distance" class="set-input" style="width:72px;" value="${escapeHtml(a.distance || "")}" placeholder="—" />
            <span class="muted small">mi</span>
          </div>
        </div>
        <div class="row" style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
          <span>Notes <span class="tiny muted">(optional)</span></span>
        </div>
        <textarea id="cardio-notes" rows="2" placeholder="Opponent, route, how it felt…" style="margin-top:6px;">${escapeHtml(a.notes || "")}</textarea>
      </div>
      <div class="tiny muted" style="margin-top:8px; text-align:center;">You'll rate how hard this was when you finish — that's what drives its effort score.</div>
    `;
    document.getElementById("cardio-distance").addEventListener("change", (e) => { a.distance = e.target.value; DB.kvSet("activeCardio", a); });
    document.getElementById("cardio-notes").addEventListener("change", (e) => { a.notes = e.target.value; DB.kvSet("activeCardio", a); });
    startCardioClock();
  }

  const rpeSheetOverlayEl = document.getElementById("rpe-sheet-overlay");
  const rpePickerEl = document.getElementById("rpe-picker");
  const rpeSheetCancelBtn = document.getElementById("rpe-sheet-cancel");
  const RPE_LABELS = { 1: "Very easy", 2: "Easy", 3: "Easy", 4: "Moderate", 5: "Moderate", 6: "Somewhat hard", 7: "Hard", 8: "Hard", 9: "Very hard", 10: "All-out" };

  function openRpeSheet() {
    rpePickerEl.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
      <button class="rpe-chip" data-rpe="${n}">
        <span class="rpe-chip-num">${n}</span>
        <span class="rpe-chip-label">${RPE_LABELS[n]}</span>
      </button>
    `).join("");
    rpeSheetOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => rpeSheetOverlayEl.classList.add("open"));
  }
  function closeRpeSheet() {
    rpeSheetOverlayEl.classList.remove("open");
    setTimeout(() => rpeSheetOverlayEl.classList.add("hidden"), 180);
  }
  rpeSheetCancelBtn.addEventListener("click", () => { tapFeedback(rpeSheetCancelBtn); closeRpeSheet(); });
  rpePickerEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rpe]");
    if (!t) return;
    tapFeedback(t, "primary");
    const rpe = parseInt(t.dataset.rpe, 10);
    closeRpeSheet();
    saveCardioActivity(rpe);
  });

  function renderCardioComplete(params) {
    const a = state.activities.find((x) => x.id === params.id);
    if (!a) { navigate("home"); return; }
    appEl.innerHTML = `
      <div class="complete-wrap">
        <div class="complete-icon">${ICONS.check}</div>
        <div class="complete-title">${escapeHtml(a.name)} logged</div>
        <div class="complete-subtitle">${fmtDate(a.date)} · ${fmtDuration(a.durationSec)}</div>
        ${renderEffortRing(a.effortScore)}
        <div class="complete-stats">
          <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${fmtDuration(a.durationSec)}</div></div>
          <div class="stat-card"><div class="stat-label">RPE</div><div class="stat-value">${a.rpe}/10</div></div>
          ${a.distance ? `<div class="stat-card"><div class="stat-label">Distance</div><div class="stat-value">${a.distance}<span class="stat-unit"> mi</span></div></div>` : ""}
          <div class="stat-card"><div class="stat-label">Training load</div><div class="stat-value">${Math.round(sessionLoad(a)).toLocaleString()}</div></div>
        </div>
        ${a.notes ? `<div class="card" style="text-align:left; width:100%;"><div class="small">${escapeHtml(a.notes)}</div></div>` : ""}
        <div class="complete-actions">
          <button class="btn btn-primary" data-action="complete-done">Done</button>
        </div>
      </div>
    `;
    initEffortRing(document.getElementById("effort-ring"));
  }

  function renderActivityDetail(params) {
    const a = state.activities.find((x) => x.id === params.id);
    if (!a) { navigate("home"); return; }
    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="back">‹ Back</button>
        <button class="icon-btn icon-btn-trash" data-action="delete-activity" data-id="${a.id}" aria-label="Delete">${ICONS.trash}</button>
      </div>
      <div class="cardio-active-icon">${activityTypeIcon(a.activityType)}</div>
      <h1 style="text-align:center;">${escapeHtml(a.name)}</h1>
      <div class="small muted" style="text-align:center; margin-top:-12px;">${fmtDate(a.date)}</div>
      ${renderEffortRing(a.effortScore)}
      <div class="complete-stats">
        <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${fmtDuration(a.durationSec)}</div></div>
        <div class="stat-card"><div class="stat-label">RPE</div><div class="stat-value">${a.rpe}/10</div></div>
        ${a.distance ? `<div class="stat-card"><div class="stat-label">Distance</div><div class="stat-value">${a.distance}<span class="stat-unit"> mi</span></div></div>` : ""}
        <div class="stat-card"><div class="stat-label">Training load</div><div class="stat-value">${Math.round(sessionLoad(a)).toLocaleString()}</div></div>
      </div>
      ${a.notes ? `<div class="card" style="text-align:left;"><div class="small">${escapeHtml(a.notes)}</div></div>` : ""}
    `;
    initEffortRing(document.getElementById("effort-ring"));
  }

  // ---------- Render ----------
  let lastRenderedHash = null;

  // Collapsing large-title header — see #mini-topbar in index.html. Only
  // the tab screens use it; everything else (workout-active, profile,
  // routine-edit, etc.) has its own topbar and leaves this hidden. Settings
  // moved behind the profile button 2026-10-22 and is no longer a tab, but
  // stays reachable as its own route from the Profile screen.
  const TAB_ROUTES = ["home", "history", "analytics"];
  const TAB_TITLES = { home: "Home", history: "History", analytics: "Analytics" };
  const miniTopbarEl = document.getElementById("mini-topbar");
  const miniTopbarTitleEl = document.getElementById("mini-topbar-title");
  const profileBtnEl = document.getElementById("profile-btn");
  const fabStartEl = document.getElementById("fab-start");
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render() {
    const { route, params } = parseHash();
    const navigated = location.hash !== lastRenderedHash;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.route === route));
    const isTabRoute = TAB_ROUTES.includes(route);
    document.getElementById("tabbar").style.display = isTabRoute ? "flex" : "none";
    profileBtnEl.style.display = isTabRoute ? "flex" : "none";
    fabStartEl.style.display = isTabRoute ? "flex" : "none";

    function paint() {
      switch (route) {
        case "home": renderHome(); break;
        case "history": renderHistory(params); break;
        case "analytics": renderAnalytics(); break;
        case "exercises": navigate("analytics"); break; // legacy route
        case "settings": renderSettings(); break;
        case "profile": renderProfile(); break;
        case "routine-edit": renderRoutineEdit(params); break;
        case "workout-active": renderWorkoutActive(); break;
        case "workout-detail": renderWorkoutDetail(params); break;
        case "workout-complete": renderWorkoutComplete(params); break;
        case "exercise-detail": renderExerciseDetail(params); break;
        case "cardio-active": renderCardioActive(); break;
        case "cardio-complete": renderCardioComplete(params); break;
        case "activity-detail": renderActivityDetail(params); break;
        default: renderHome(); break;
      }

      miniTopbarEl.dataset.enabled = isTabRoute ? "1" : "0";
      miniTopbarTitleEl.textContent = isTabRoute ? TAB_TITLES[route] || "" : "";

      // Only animate + scroll-to-top on an actual navigation (the hash
      // changed) — not on in-place re-renders triggered by things like
      // toggling a set checkbox, which call render() without touching the
      // hash and would otherwise flash/jump distractingly on every tap.
      if (navigated) {
        appEl.scrollTop = 0;
        miniTopbarEl.classList.remove("visible");
        appEl.classList.remove("app-enter");
        void appEl.offsetWidth;
        appEl.classList.add("app-enter");
      }
      lastRenderedHash = location.hash;
    }

    // A real navigation cross-fades the outgoing/incoming screen (named on
    // #app alone, so the tabbar/mini-topbar/overlays — unchanged pixels —
    // never flicker). Feature-detected and skipped under reduced-motion;
    // an in-place re-render always paints immediately, never transitioned.
    // lastRenderedHash === null means this is the very first render (app
    // just loaded) — there's no prior #app content to transition from, so
    // a view transition here has nothing to do and Chrome logs it as a
    // skipped/aborted transition. Skip attempting one on that first paint.
    if (navigated && lastRenderedHash !== null && !prefersReducedMotion && document.startViewTransition) {
      const vt = document.startViewTransition(paint);
      // A transition can legitimately be skipped (e.g. the page just
      // loaded, or another transition was already running) — that's a
      // normal fallback to an instant paint, not an error worth surfacing.
      vt.updateCallbackDone.catch(() => {});
      vt.ready.catch(() => {});
      vt.finished.catch(() => {});
    } else {
      paint();
    }
  }

  // Collapsing-header reveal: fade the mini bar in once the big title has
  // scrolled mostly out of view. Cheap rAF-guarded class toggle, not a
  // continuous scroll-position tween — the mini bar only ever needs to be
  // fully shown or fully hidden.
  let miniTopbarRaf = null;
  appEl.addEventListener("scroll", () => {
    if (miniTopbarEl.dataset.enabled !== "1" || miniTopbarRaf) return;
    miniTopbarRaf = requestAnimationFrame(() => {
      miniTopbarRaf = null;
      miniTopbarEl.classList.toggle("visible", appEl.scrollTop > 36);
    });
  }, { passive: true });

  // Which metric the home-page progress chart shows. In-memory only — it
  // resets to effort on each launch, which is the more meaningful default.
  let homeChartMetric = "effort"; // "effort" | "volume"

  // Recent workouts (oldest -> newest) mapped to chart points for the
  // currently selected home metric.
  function homeProgressData() {
    const recent = state.workouts.slice(0, 12).reverse();
    if (homeChartMetric === "volume") {
      return recent.map((w) => ({ date: w.date, value: volumeDisplayValue(w) }));
    }
    return recent
      .filter((w) => typeof w.effortScore === "number")
      .map((w) => ({ date: w.date, value: w.effortScore }));
  }

  function homeChartFormat() {
    return homeChartMetric === "volume"
      ? (v) => `${Math.round(v).toLocaleString()} ${unitLabel()}`
      : (v) => `${Math.round(v)}% effort`;
  }

  // Glanceable progress overview at the top of Home: one trend line across
  // recent workouts, toggleable between effort score and total volume.
  function renderHomeProgressSection() {
    const data = homeProgressData();
    if (data.length < 2) return "";
    const label = homeChartMetric === "volume" ? "Total volume across recent workouts" : "Effort score across recent workouts";
    return `
      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">Progress</h3>
          <div class="segmented" style="width:170px;">
            <button data-action="home-chart-metric" data-metric="effort" class="${homeChartMetric === "effort" ? "active" : ""}">Effort</button>
            <button data-action="home-chart-metric" data-metric="volume" class="${homeChartMetric === "volume" ? "active" : ""}">Volume</button>
          </div>
        </div>
        <div class="chart-wrap">${renderLineChart(data, { label })}</div>
      </div>
    `;
  }

  // This-week training summary: streak, sessions this week, and hard sets per
  // muscle group over the last 7 days (a direct read on the effort Muscle axis).
  function renderWeeklySummarySection() {
    const vol = weeklyMuscleVolume(7);
    const streak = weekStreak();
    const thisWeek = workoutsThisWeek();
    if (vol.length === 0 && streak === 0) return "";
    const maxSets = Math.max(1, ...vol.map((v) => v.sets));
    return `
      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">This week</h3>
          <span class="small muted">${thisWeek} session${thisWeek === 1 ? "" : "s"}${streak > 1 ? ` · ${streak}-week streak 🔥` : ""}</span>
        </div>
        ${vol.length ? `
          <div class="card">
            ${vol.map((v) => `
              <div class="muscle-vol-row">
                <span class="muscle-vol-name">${escapeHtml(v.muscle)}</span>
                <span class="muscle-vol-track"><span class="muscle-vol-fill" style="width:${Math.round(100 * v.sets / maxSets)}%"></span></span>
                <span class="muscle-vol-count">${v.sets}</span>
              </div>
            `).join("")}
            <div class="tiny muted" style="margin-top:8px;">Hard working sets per muscle group, last 7 days.</div>
          </div>
        ` : `<div class="card"><span class="small muted">No sets logged this week yet.</span></div>`}
      </div>
    `;
  }

  // Home's routine list: the user's own routines in their saved order.
  function orderedHomeRoutines() {
    const entries = state.routines.map((routine, i) => ({ routine, i, isToday: false }));
    return entries;
  }

  // Home's hero card — the acute:chronic training-load ratio (already
  // computed for Analytics by trainingLoadBalance()) given the big-numeral
  // gradient-card treatment observed on every screen of the Outsiders
  // reference. Falls back to a plain effort-colored hero once there's at
  // least one logged workout but not yet enough history (<3 sessions/28d)
  // for a load ratio; renders nothing for a brand-new, empty account.
  function homeHeroCardHtml() {
    const last = allSessions()[0];
    const load = trainingLoadBalance();
    const streak = weekStreak();
    const sessions = workoutsThisWeek();
    const tiles = `
      <div class="metric-tiles">
        <div class="metric-tile metric-tile-tap" data-action="go-calendar"><span class="metric-tile-dot" style="background:var(--accent);"></span><span class="metric-tile-label">Streak</span><div class="metric-tile-value">${streak} wk</div></div>
        <div class="metric-tile metric-tile-tap" data-action="history-tab" data-tab="workouts"><span class="metric-tile-dot" style="background:var(--success);"></span><span class="metric-tile-label">This week</span><div class="metric-tile-value">${sessions} session${sessions === 1 ? "" : "s"}</div></div>
      </div>
    `;

    if (load) {
      const zone = load.ratio < 0.8 ? "easing" : load.ratio <= 1.3 ? "optimal" : load.ratio <= 1.5 ? "pushing" : "spike";
      const ZONE_COLOR = { easing: "#8b93f0", optimal: "var(--success)", pushing: "var(--warmup)", spike: "var(--danger)" };
      const ZONE_SUB = {
        easing: "Easing off vs. your recent average.",
        optimal: "In the sweet spot — load matches what you're adapted to.",
        pushing: "Pushing above your recent average.",
        spike: "Spiking — well above what you're adapted to.",
      };
      const spark = weeklyLoadSeries(8).map((w) => w.value);
      return `
        <div class="hero-card hero-card-${zone} hero-card-tap" data-action="open-training-balance">
          <div class="hero-card-label">Training balance</div>
          <div class="hero-card-num">${load.ratio.toFixed(2)}<span class="hero-card-unit">×</span></div>
          <div class="hero-card-sub">${ZONE_SUB[zone]}</div>
          ${renderSparkline(spark, ZONE_COLOR[zone])}
        </div>
        ${tiles}
      `;
    }

    if (last && typeof last.effortScore === "number") {
      const navAction = isCardioSession(last) ? "view-activity" : "view-workout";
      return `
        <div class="hero-card hero-card-pink hero-card-tap" data-action="${navAction}" data-id="${last.id}">
          <div class="hero-card-label">Last session effort</div>
          <div class="hero-card-num">${last.effortScore}<span class="hero-card-unit">%</span></div>
          <div class="hero-card-sub">${escapeHtml(last.name)} · ${fmtDate(last.date)}</div>
        </div>
        ${tiles}
      `;
    }

    return "";
  }

  // Detail sheet behind the Home hero card tap — the exact numbers behind
  // the ratio, not just the zone caption.
  function openTrainingBalanceSheet() {
    const load = trainingLoadBalance();
    if (!load) return;
    const zone = load.ratio < 0.8 ? "easing" : load.ratio <= 1.3 ? "optimal" : load.ratio <= 1.5 ? "pushing" : "spike";
    const ZONE_EXPLAIN = {
      easing: "This week's training load is lighter than your recent average. Normal during a deload; worth a look if it's not intentional.",
      optimal: "This week's load matches the 4-week average you're adapted to — the zone associated with the lowest injury risk.",
      pushing: "This week is ramping up faster than your recent average. Productive in small doses — keep an eye on recovery.",
      spike: "This week is well above what your body's been adapted to. The zone sports science flags for elevated injury risk.",
    };
    const spark = weeklyLoadSeries(8);
    const html = `
      <div class="info-stat-row"><span>This week's load</span><strong>${Math.round(load.acute).toLocaleString()}</strong></div>
      <div class="info-stat-row"><span>4-week average</span><strong>${Math.round(load.chronicWeekly).toLocaleString()}</strong></div>
      <div class="info-stat-row"><span>Ratio</span><strong>${load.ratio.toFixed(2)}×</strong></div>
      <div class="chart-wrap" style="margin:12px 0;">${renderLineChart(spark.map((w) => ({ date: new Date(w.start).toISOString(), value: w.value })), { label: "Weekly training load" })}</div>
      <div class="small">${ZONE_EXPLAIN[zone]}</div>
      <div class="tiny muted" style="margin-top:10px;">Load = duration × RPE per session (Foster et al. 2001), summed across both lifting and logged activities. Ratio = this week ÷ 4-week average (Gabbett 2016 acute:chronic workload ratio); 0.8–1.3× is the sweet spot, &gt;1.5× is a spike.</div>
    `;
    openInfoSheet("Training balance", html);
  }

  function renderHome() {
    const last = state.workouts[0];
    appEl.innerHTML = `
      <div class="topbar"><h1>Home</h1></div>

      ${homeHeroCardHtml()}

      ${state.activeWorkout ? `
        <div class="card card-tap" data-action="resume-workout" style="border-color:var(--accent); background:var(--accent-bg);">
          <div class="row">
            <div>
              <div style="font-weight:700;">Workout in progress</div>
              <div class="small muted">${state.activeWorkout.name} · tap to resume</div>
            </div>
            <span class="badge badge-accent">Resume</span>
          </div>
        </div>` : ""}

      ${state.activeCardio ? `
        <div class="card card-tap" data-action="resume-cardio" style="border-color:var(--accent); background:var(--accent-bg);">
          <div class="row">
            <div>
              <div style="font-weight:700;">${activityTypeIcon(state.activeCardio.activityType)} ${escapeHtml(state.activeCardio.name)} in progress</div>
              <div class="small muted">tap to resume</div>
            </div>
            <span class="badge badge-accent">Resume</span>
          </div>
        </div>` : ""}

      ${renderTrainingCoachHtml({ title: "Coach says", limit: 2, more: true })}

      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">Routines</h3>
        </div>
        ${state.routines.length === 0 ? emptyStateHtml("No routines yet", "Create one to pre-load your sets each session.", "routines") : ""}
        ${orderedHomeRoutines().map(({ routine: r, isToday }) => {
          const lastEffort = lastEffortForRoutine(r.id);
          return `
          <div class="card card-tap" data-action="open-routine" data-id="${r.id}" ${isToday ? `style="border-color:var(--accent);"` : ""}>
            <div class="row">
              <div>
                <div style="font-weight:700;">${escapeHtml(r.name)}${isToday ? ` <span class="badge badge-accent" style="margin-left:4px; vertical-align:2px;">Today</span>` : ""}</div>
                <div class="small muted">${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}${lastEffort != null ? ` · Last: ${lastEffort}% effort` : ""}</div>
              </div>
              <button class="btn btn-sm btn-accent" data-action="start-routine" data-id="${r.id}">Start</button>
            </div>
          </div>
        `;
        }).join("")}
        <button class="fab-add" data-action="new-routine">+ New routine</button>
      </div>

      ${renderHomeProgressSection()}

      ${renderWeeklySummarySection()}

      ${last ? `
        <div class="section">
          <h3>Last workout</h3>
          <div class="card card-tap" data-action="view-workout" data-id="${last.id}">
            <div class="row">
              <div style="font-weight:700;">${escapeHtml(last.name)}</div>
              <div class="small muted">${fmtDate(last.date)}</div>
            </div>
            <div class="small muted" style="margin-top:4px;">${totalVolume(last)} ${unitLabel()} volume${last.prCount ? ` · ${last.prCount} PR${last.prCount > 1 ? "s" : ""}` : ""}</div>
          </div>
        </div>` : ""}
    `;
    const pd = homeProgressData();
    if (pd.length >= 2) initProgressChart(document.getElementById("progress-chart"), pd, homeChartFormat());
  }

  // Total working-set volume (weight x reps) in the current display unit,
  // as a number — totalVolume below is the formatted-string version.
  function volumeDisplayValue(workout) {
    let v = 0;
    for (const e of workout.exercises) for (const s of e.sets) if (!s.isWarmup) v += (s.weight || 0) * (s.reps || 0);
    return displayUnit() === "kg" ? lbToKg(v) : v;
  }

  function totalVolume(workout) {
    return Math.round(volumeDisplayValue(workout)).toLocaleString();
  }

  function renderHistory(params) {
    const tab = params.tab || "workouts";
    appEl.innerHTML = `
      <div class="topbar"><h1>History</h1></div>
      <div class="segmented" style="margin-bottom:16px;">
        <button data-action="history-tab" data-tab="workouts" class="${tab === "workouts" ? "active" : ""}">Workouts</button>
        <button data-action="history-tab" data-tab="exercises" class="${tab === "exercises" ? "active" : ""}">Exercises</button>
        <button data-action="history-tab" data-tab="calendar" class="${tab === "calendar" ? "active" : ""}">Calendar</button>
      </div>
      <div id="history-body"></div>
    `;
    const body = document.getElementById("history-body");
    if (tab === "calendar") {
      renderCalendarInto(body);
      return;
    }
    if (tab === "workouts") {
      const sessions = allSessions();
      if (sessions.length === 0) {
        body.innerHTML = emptyStateHtml("No workouts logged", "Finish a workout or activity and it'll show up here.", "workouts");
        return;
      }
      body.innerHTML = sessions.map((w) => {
        const cardio = isCardioSession(w);
        if (cardio) {
          return `
          <div class="card card-tap" data-action="view-activity" data-id="${w.id}">
            <div class="row" style="gap:12px;">
              <div style="min-width:0; flex:1;">
                <div style="font-weight:700;">${activityTypeIcon(w.activityType)} ${escapeHtml(w.name)}</div>
                <div class="small muted">${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}</div>
              </div>
              <div class="row-gap">
                <span class="badge badge-effort">${w.effortScore}% effort</span>
                <button class="icon-btn icon-btn-trash" data-action="delete-activity" data-id="${w.id}" aria-label="Delete activity">${ICONS.trash}</button>
              </div>
            </div>
          </div>`;
        }
        return `
        <div class="card card-tap" data-action="view-workout" data-id="${w.id}">
          <div class="row" style="gap:12px;">
            <div style="min-width:0; flex:1;">
              <div style="font-weight:700;">${escapeHtml(w.name)}</div>
              <div class="small muted">${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}</div>
            </div>
            <div class="row-gap">
              ${typeof w.effortScore === "number" ? `<span class="badge badge-effort">${w.effortScore}% effort</span>` : ""}
              ${w.prCount ? `<span class="badge badge-success">${w.prCount} PR${w.prCount > 1 ? "s" : ""}</span>` : ""}
              <button class="icon-btn icon-btn-trash" data-action="delete-workout" data-id="${w.id}" aria-label="Delete workout">${ICONS.trash}</button>
            </div>
          </div>
        </div>`;
      }).join("");
    } else {
      const ids = new Set();
      state.workouts.forEach((w) => w.exercises.forEach((e) => ids.add(e.exerciseId)));
      const list = [...ids].map((id) => exerciseById(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        body.innerHTML = emptyStateHtml("No exercise history", "Log workouts to track progress per exercise.", "history");
        return;
      }
      body.innerHTML = list.map((ex) => `
        <div class="list-row card-tap" data-action="view-exercise" data-id="${ex.id}">
          <div>
            <div class="row-title">${tierChipHtml(ex)} ${escapeHtml(ex.name)}</div>
            <div class="tiny muted">${ex.muscle}</div>
          </div>
          <span>${levelBadgeHtml(bestStrengthRank(ex.id))} <span class="muted">›</span></span>
        </div>
      `).join("");
    }
  }

  // Which month the History calendar shows: 0 = current, negative = past.
  let calendarMonthOffset = 0;

  // Calendar day tap: straight to the session if there's exactly one,
  // otherwise a quick-pick list (info sheet) of that day's sessions.
  function openDaySheet(dateStr) {
    const sessions = allSessions().filter((s) => new Date(s.date).toISOString().slice(0, 10) === dateStr);
    if (sessions.length === 0) return;
    if (sessions.length === 1) {
      const s = sessions[0];
      navigate(isCardioSession(s) ? "activity-detail" : "workout-detail", { id: s.id });
      return;
    }
    const label = new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    const rows = sessions.map((s) => {
      const cardio = isCardioSession(s);
      const route = cardio ? "activity-detail" : "workout-detail";
      const sub = cardio
        ? `${fmtDuration(s.durationSec)} · RPE ${s.rpe}/10`
        : `${fmtDuration(s.durationSec)}${typeof s.effortScore === "number" ? ` · ${s.effortScore}% effort` : ""}`;
      return `
        <div class="list-row card-tap" data-nav-route="${route}" data-nav-id="${s.id}">
          <div><div class="row-title">${cardio ? activityTypeIcon(s.activityType) + " " : ""}${escapeHtml(s.name)}</div><div class="tiny muted">${sub}</div></div>
          <span class="muted">›</span>
        </div>`;
    }).join("");
    openInfoSheet(label, rows);
  }

  function renderCalendarInto(body) {
    const days = workoutDaySet();
    const volumes = dayVolumeMap();
    const maxVolume = Math.max(0, ...volumes.values());
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calendarMonthOffset);
    const year = base.getFullYear(), month = base.getMonth();
    const monthName = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell cal-empty"></div>`;
    let monthCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const has = days.has(ds); if (has) monthCount++;
      const tierClass = has ? `tier-${dayVolumeTier(volumes.get(ds) || 0, maxVolume)}` : "";
      cells += `<div class="cal-cell ${has ? "cal-active card-tap" : ""} ${tierClass} ${ds === todayStr ? "cal-today" : ""}" ${has ? `data-action="open-day" data-date="${ds}"` : ""}><span>${d}</span></div>`;
    }
    const dow = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
    body.innerHTML = `
      <div class="cal-stats">
        <div class="stat-card"><div class="stat-label">Streak</div><div class="stat-value">${weekStreak()} wk</div></div>
        <div class="stat-card"><div class="stat-label">This week</div><div class="stat-value">${workoutsThisWeek()}</div></div>
        <div class="stat-card"><div class="stat-label">This month</div><div class="stat-value">${monthCount}</div></div>
      </div>
      <div class="cal-head">
        <button class="cal-nav" data-action="cal-prev" aria-label="Previous month">‹</button>
        <span class="cal-month">${monthName}</span>
        <button class="cal-nav" data-action="cal-next" ${calendarMonthOffset >= 0 ? "disabled" : ""} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">${dow}${cells}</div>
    `;
  }

  // ===== Analytics =====
  // The Analytics tab: progress (strength trends, tonnage) and stimulus
  // (weekly hard sets vs. hypertrophy volume landmarks, acute:chronic load
  // ratio, effort-axis trends). Exercise browsing lives in History > Exercises.

  // Which lift the strength-trend chart shows. In-memory only.
  let analyticsExerciseId = null;

  function weekStartMs(t) {
    const d = new Date(t);
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // Total working-set tonnage per week (display units), oldest -> newest,
  // always `weeks` slots ending at the current week (empty weeks = 0).
  function weeklyTonnageSeries(weeks = 8) {
    const WEEK = 7 * 86400000;
    const thisWeek = weekStartMs(Date.now());
    const out = [];
    for (let i = weeks - 1; i >= 0; i--) out.push({ start: thisWeek - i * WEEK, value: 0 });
    for (const w of state.workouts) {
      const t = weekStartMs(new Date(w.date).getTime());
      const slot = out.find((o) => o.start === t);
      if (slot) slot.value += volumeDisplayValue(w);
    }
    return out;
  }

  // Weekly unified training load (see sessionLoad), oldest -> newest, for
  // the Home hero card's sparkline — the cross-modality counterpart to
  // weeklyTonnageSeries above (which stays strength-only/lb for the
  // Analytics volume chart).
  function weeklyLoadSeries(weeks = 8) {
    const WEEK = 7 * 86400000;
    const thisWeek = weekStartMs(Date.now());
    const out = [];
    for (let i = weeks - 1; i >= 0; i--) out.push({ start: thisWeek - i * WEEK, value: 0 });
    for (const s of allSessions()) {
      const t = weekStartMs(new Date(s.date).getTime());
      const slot = out.find((o) => o.start === t);
      if (slot) slot.value += sessionLoad(s);
    }
    return out;
  }

  // Acute:chronic workload ratio — the sports-science "are you ramping too
  // fast / detraining?" signal (Gabbett 2016). Acute = last 7 days of
  // unified training load; chronic = average weekly load over the last 28
  // days. ~0.8–1.3 is the classic sweet spot; >1.5 is a spike (injury-risk
  // zone), <0.8 is easing off. Unified load (sessionLoad) means a heavy
  // squat day and a hard run both count toward the same ratio.
  function trainingLoadBalance() {
    const now = Date.now();
    let acute = 0, chronic = 0, sessions28 = 0;
    for (const s of allSessions()) {
      const age = now - new Date(s.date).getTime();
      if (age < 0) continue;
      const load = sessionLoad(s);
      if (age <= 7 * 86400000) acute += load;
      if (age <= 28 * 86400000) { chronic += load; sessions28++; }
    }
    const chronicWeekly = chronic / 4;
    if (!(chronicWeekly > 0) || sessions28 < 3) return null; // not enough history to be meaningful
    return { ratio: acute / chronicWeekly, acute, chronicWeekly };
  }

  // Lifts you actually train, most-logged first — the chip choices for the
  // strength trend. Needs ≥2 sessions to draw a trend at all.
  function mostTrainedExercises(limit = 6) {
    const counts = new Map();
    for (const w of state.workouts) {
      for (const e of w.exercises) {
        if (e.sets.some((s) => s.completed && !s.isWarmup)) {
          counts.set(e.exerciseId, (counts.get(e.exerciseId) || 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => exerciseById(id))
      .filter(Boolean);
  }

  // Best estimated 1RM per session for one lift, oldest -> newest, display units.
  function e1rmSeriesFor(exerciseId, limit = 12) {
    const pts = [];
    for (const w of state.workouts) {
      const e = w.exercises.find((x) => x.exerciseId === exerciseId);
      if (!e) continue;
      let best = 0;
      for (const s of e.sets) {
        if (s.completed && !s.isWarmup && s.weight > 0) best = Math.max(best, estOneRm(s.weight, s.reps));
      }
      if (best > 0) pts.push({ date: w.date, value: displayUnit() === "kg" ? lbToKg(best) : best });
    }
    return pts.slice(0, limit).reverse();
  }

  // Average hard sets per muscle group per week over the last 28 days,
  // scored against the hypertrophy volume landmarks (MEV ~10, MRV ~20
  // weekly sets — the RP/Israetel rule-of-thumb band).
  const STIM_MEV = 10, STIM_MRV = 20;
  function muscleStimulus(days = 28) {
    // Fractional sets per muscle (primary 1, helper 0.5 — Pelland 2024),
    // averaged per week over the span actually logged (max `days`).
    const recent = workoutsWithin(days);
    if (!recent.length) return [];
    const earliest = Math.min(...recent.map((w) => new Date(w.date).getTime()));
    const weeksSpanned = Math.max(1, Math.min(days / 7, (Date.now() - earliest) / (7 * 86400000) + 1 / 7));
    const { total } = fractionalVolume(recent);
    return Object.entries(total)
      .map(([m, sets]) => {
        const perWeek = sets / weeksSpanned;
        const zone = perWeek < STIM_MEV ? "low" : perWeek <= STIM_MRV ? "optimal" : "high";
        return { muscle: MUSCLE_LABELS[m] || m, perWeek, zone };
      })
      .sort((a, b) => b.perWeek - a.perWeek);
  }

  function openTrainingLoadSheet() {
    const load = trainingLoadBalance();
    if (!load) return;
    const zone = load.ratio < 0.8 ? "easing" : load.ratio <= 1.3 ? "optimal" : load.ratio <= 1.5 ? "pushing" : "spike";
    const ZONE_TEXT = {
      easing: "Lighter than your recent average — fine for a deload, watch for detraining if it persists.",
      optimal: "Matches what your body's adapted to — the lowest-injury-risk zone.",
      pushing: "Ramping above your recent average. Productive, but keep an eye on recovery.",
      spike: "Well above what you're adapted to. Elevated injury risk; consider pulling back.",
    };
    openInfoSheet("Training load", `
      <div class="info-stat-row"><span>Acute (last 7 days)</span><strong>${Math.round(load.acute).toLocaleString()}</strong></div>
      <div class="info-stat-row"><span>Chronic (4-week avg/wk)</span><strong>${Math.round(load.chronicWeekly).toLocaleString()}</strong></div>
      <div class="info-stat-row"><span>Ratio</span><strong>${load.ratio.toFixed(2)}×</strong></div>
      <div class="small" style="margin-top:8px;">${ZONE_TEXT[zone]}</div>
      <div class="tiny muted" style="margin-top:10px;">Load = duration × RPE per session (strength sessions use effort score ÷10 as an RPE-equivalent), across both lifting and logged activities. 0.8–1.3× is the sweet spot, &gt;1.5× is a spike (Gabbett 2016).</div>
    `);
  }

  function openMuscleStimSheet(muscleLabel) {
    const stim = muscleStimulus();
    const v = stim.find((x) => x.muscle === muscleLabel);
    if (!v) return;
    const ZONE_TEXT = { low: "Under the zone that reliably drives growth — room to add volume.", optimal: "In the growth zone (MEV–MRV).", high: "Above MRV — very high; watch recovery before adding more." };
    openInfoSheet(muscleLabel, `
      <div class="info-stat-row"><span>Sets / week (avg, last 4wk)</span><strong>${v.perWeek.toFixed(1)}</strong></div>
      <div class="info-stat-row"><span>Target band (MEV–MRV)</span><strong>${STIM_MEV}–${STIM_MRV}</strong></div>
      <div class="small" style="margin-top:8px;">${ZONE_TEXT[v.zone]}</div>
      <div class="tiny muted" style="margin-top:10px;">Fractional sets: 1 per set where this is the target muscle, 0.5 where it's a secondary mover (Pelland et al. 2024).</div>
    `);
  }

  // Mean effort-axis scores (intensity / muscle / volume, each 0-100) over
  // the last 28 days vs. the 28 days before that.
  function effortAxisTrend() {
    const now = Date.now();
    const cur = { intensity: [], muscle: [], volume: [], strength: [] };
    const prev = { intensity: [], muscle: [], volume: [], strength: [] };
    for (const w of state.workouts) {
      if (!w.effortBreakdown) continue;
      const age = now - new Date(w.date).getTime();
      const bucket = age <= 28 * 86400000 ? cur : age <= 56 * 86400000 ? prev : null;
      if (!bucket) continue;
      for (const k of ["intensity", "muscle", "volume"]) bucket[k].push(w.effortBreakdown[k] || 0);
      if (typeof w.effortBreakdown.strength === "number") bucket.strength.push(w.effortBreakdown.strength);
    }
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return ["intensity", "muscle", "volume", "strength"].map((k) => ({
      axis: k,
      current: avg(cur[k]),
      previous: avg(prev[k]),
    }));
  }

  // PR events (new best working-set weight for a lift), newest first. The
  // first-ever log of a lift isn't counted — a PR means beating a previous best.
  function recentPRs(limit = 8) {
    const best = new Map();
    const events = [];
    for (const w of [...state.workouts].reverse()) { // oldest -> newest
      for (const e of w.exercises) {
        let maxW = 0, reps = 0;
        for (const s of e.sets) {
          if (s.completed && !s.isWarmup && (s.weight || 0) > maxW) { maxW = s.weight; reps = s.reps; }
        }
        if (!(maxW > 0)) continue;
        if (best.has(e.exerciseId)) {
          if (maxW > best.get(e.exerciseId)) {
            best.set(e.exerciseId, maxW);
            events.push({ date: w.date, exerciseId: e.exerciseId, weight: maxW, reps });
          }
        } else {
          best.set(e.exerciseId, maxW);
        }
      }
    }
    return events.reverse().slice(0, limit);
  }

  // Weekly tonnage as a compact SVG bar chart. Values already in display units.
  function renderTonnageBars(series) {
    if (!series.some((s) => s.value > 0)) {
      return `<div class="chart-empty">Log workouts to see weekly volume</div>`;
    }
    const W = 320, H = 150, padX = 10, padTop = 22, padBottom = 24;
    const baseY = H - padBottom;
    const max = Math.max(...series.map((s) => s.value), 1);
    const slot = (W - padX * 2) / series.length;
    const barW = Math.min(28, slot * 0.62);
    const fmtK = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
    const bars = series.map((s, i) => {
      const h = Math.max(s.value > 0 ? 3 : 0, (s.value / max) * (baseY - padTop));
      const x = padX + i * slot + (slot - barW) / 2;
      const y = baseY - h;
      const isCur = i === series.length - 1;
      const d = new Date(s.start);
      const lbl = `${d.getMonth() + 1}/${d.getDate()}`;
      return `
        <rect x="${(padX + i * slot).toFixed(1)}" y="${padTop}" width="${slot.toFixed(1)}" height="${(baseY - padTop).toFixed(1)}"
          fill="transparent" data-action="tonnage-bar-info" data-i="${i}" style="cursor:pointer;" />
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5"
          class="ton-bar ${isCur ? "ton-bar-cur" : ""}" style="--d:${i}" pointer-events="none" />
        ${s.value > 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" class="ton-val" pointer-events="none">${fmtK(s.value)}</text>` : ""}
        ${i % 2 === series.length % 2 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-date-label" pointer-events="none">${lbl}</text>` : ""}
      `;
    }).join("");
    return `
      <svg class="chart-svg ton-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weekly training volume">
        <line x1="${padX}" y1="${baseY}" x2="${W - padX}" y2="${baseY}" class="chart-baseline" />
        ${bars}
      </svg>
    `;
  }

  // Analytics: your strength level on every ranked lift you've logged
  // (strongest first), plus the full difficulty ranking of the library.
  function renderAnalyticsLevelsHtml() {
    const ids = new Set();
    state.workouts.forEach((w) => w.exercises.forEach((e) => ids.add(e.exerciseId)));
    const ranked = [...ids].map((id) => ({ ex: exerciseById(id), r: bestStrengthRank(id) }))
      .filter((x) => x.ex && x.r).sort((a, b) => b.r.pctl - a.r.pctl);
    const lib = allExercises().map((ex) => ({ ex, d: difficultyInfo(ex) }))
      .sort((a, b) => b.d.points - a.d.points || a.ex.name.localeCompare(b.ex.name));
    const byTier = ["S", "A", "B", "C", "D"].map((t) => ({ t, list: lib.filter((x) => x.d.tier === t) })).filter((g) => g.list.length);
    const TIER_NOTES = { S: "heavy, axial-loaded full-body lifts", A: "big lower-body & loaded compounds", B: "upper-body compounds & machine leg work", C: "lighter compounds & loaded isolation", D: "single-joint isolation" };
    return `
      ${ranked.length ? `
        <div class="section">
          <h3>Strength levels</h3>
          <div class="card">
            ${ranked.map(({ ex, r }) => `
              <div class="lvl-row card-tap" data-action="view-exercise" data-id="${ex.id}">
                <span class="lvl-row-name">${tierChipHtml(ex)} ${escapeHtml(ex.name)}</span>
                <span class="lvl-row-track"><span class="lvl-row-fill lvl-fill-${r.levelIndex}" style="width:${Math.max(2, r.pctl).toFixed(1)}%"></span></span>
                ${levelBadgeHtml(r)}
              </div>`).join("")}
            <div class="tiny muted" style="margin-top:8px;">Your best set on each lift vs. strengthlevel.com male standards at your bodyweight. Bar = share of lifters you out-lift.</div>
          </div>
        </div>` : ""}
      <div class="section">
        <h3>Exercise difficulty ranking</h3>
        <div class="card">
          ${byTier.map((g) => `
            <details class="tier-group">
              <summary><span class="tier-chip tier-${g.t}">${g.t}</span> <span class="small">${TIER_NOTES[g.t]}</span> <span class="tiny muted">· ${g.list.length}</span></summary>
              ${g.list.map(({ ex, d }) => `
                <div class="list-row card-tap" data-action="view-exercise" data-id="${ex.id}">
                  <span class="small">${escapeHtml(ex.name)}</span>
                  <span class="tiny muted">${d.points}/10${d.estimated ? " · est." : ""}</span>
                </div>`).join("")}
            </details>`).join("")}
          <div class="tiny muted" style="margin-top:8px;">Points = 2 × muscle mass + spinal load + skill. Higher tiers count for more in your effort score.</div>
        </div>
      </div>`;
  }

  function renderAnalytics() {
    // --- snapshot (last 28 days) ---
    const cutoff28 = Date.now() - 28 * 86400000;
    const recent = state.workouts.filter((w) => new Date(w.date).getTime() >= cutoff28);
    const tonnage28 = recent.reduce((t, w) => t + volumeDisplayValue(w), 0);
    const efforts = recent.filter((w) => typeof w.effortScore === "number").map((w) => w.effortScore);
    const avgEffort = efforts.length ? Math.round(efforts.reduce((a, b) => a + b, 0) / efforts.length) : null;
    const prs28 = recent.reduce((t, w) => t + (w.prCount || 0), 0);

    if (state.workouts.length === 0) {
      appEl.innerHTML = `
        <div class="topbar"><h1>Analytics</h1></div>
        ${emptyStateHtml("No data yet", "Finish a few workouts and your progress and stimulus analytics will build up here.", "workouts")}
      `;
      return;
    }

    // --- strength trend ---
    const lifts = mostTrainedExercises();
    if (!analyticsExerciseId || !lifts.some((l) => l.id === analyticsExerciseId)) {
      analyticsExerciseId = lifts[0] ? lifts[0].id : null;
    }
    const e1rmData = analyticsExerciseId ? e1rmSeriesFor(analyticsExerciseId) : [];
    const e1rmDelta = e1rmData.length >= 2 ? e1rmData[e1rmData.length - 1].value - e1rmData[0].value : null;

    const load = trainingLoadBalance();
    const stim = muscleStimulus();
    const axes = effortAxisTrend();
    const prs = recentPRs();
    const AXIS_LABELS = { intensity: "Intensity", muscle: "Muscle", volume: "Volume", strength: "Strength" };

    // Load-meter marker position: map ratio 0–2 onto 0–100%.
    const loadPos = load ? Math.min(100, Math.max(0, (load.ratio / 2) * 100)) : 0;
    const loadZone = load ? (load.ratio < 0.8 ? "easing" : load.ratio <= 1.3 ? "optimal" : load.ratio <= 1.5 ? "pushing" : "spike") : null;
    const LOAD_CAPTIONS = {
      easing: "Easing off — this week is lighter than your recent average. Fine for a deload, watch for detraining if it persists.",
      optimal: "Sweet spot — this week's load matches what your body is adapted to.",
      pushing: "Pushing — load is ramping above your recent average. Productive, but keep an eye on recovery.",
      spike: "Spike — this week is way above what you're adapted to. Elevated injury risk; consider pulling back.",
    };

    appEl.innerHTML = `
      <div class="topbar"><h1>Analytics</h1></div>

      <div class="az-stats">
        <div class="stat-card"><div class="stat-label">Sessions · 4wk</div><div class="stat-value">${recent.length}</div></div>
        <div class="stat-card"><div class="stat-label">Volume · 4wk</div><div class="stat-value">${Math.round(tonnage28).toLocaleString()}<span class="stat-unit"> ${unitLabel()}</span></div></div>
        <div class="stat-card${avgEffort != null ? " stat-card-pink" : ""}"><div class="stat-label">Avg effort</div><div class="stat-value">${avgEffort != null ? avgEffort + "%" : "–"}</div></div>
        <div class="stat-card"><div class="stat-label">PRs · 4wk</div><div class="stat-value">${prs28}</div></div>
      </div>

      ${renderTrainingCoachHtml({ askClaude: true, alwaysShow: true })}

      ${lifts.length ? `
        <div class="section">
          <div class="row" style="margin-bottom:8px;">
            <h3 style="margin:0;">Strength trend</h3>
            ${e1rmDelta != null ? `<span class="badge ${e1rmDelta >= 0 ? "badge-success" : "badge-effort"}">${e1rmDelta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(e1rmDelta))} ${unitLabel()}</span>` : ""}
          </div>
          <div class="chip-row">
            ${lifts.map((l) => `<button class="chip ${l.id === analyticsExerciseId ? "chip-selected" : ""}" data-action="analytics-exercise" data-id="${l.id}">${escapeHtml(l.name)}</button>`).join("")}
          </div>
          <div class="chart-wrap">${renderLineChart(e1rmData, { label: "Estimated 1RM over recent sessions" })}</div>
          <div class="tiny muted">Best estimated 1RM per session (Epley). Tap a point for detail.</div>
        </div>
      ` : ""}

      <div class="section">
        <h3>Weekly volume</h3>
        <div class="card">
          ${renderTonnageBars(weeklyTonnageSeries())}
          <div class="tiny muted" style="margin-top:6px;">Working-set tonnage (weight × reps) per week, ${unitLabel()}.</div>
        </div>
      </div>

      ${load ? `
        <div class="section">
          <div class="row" style="margin-bottom:8px;">
            <h3 style="margin:0;">Training load</h3>
            <span class="badge az-zone-badge az-zone-${loadZone}">${load.ratio.toFixed(2)}× · ${loadZone}</span>
          </div>
          <div class="card card-tap" data-action="info-training-load">
            <div class="load-meter">
              <div class="load-band load-band-low" style="left:0; width:40%;"></div>
              <div class="load-band load-band-ok" style="left:40%; width:25%;"></div>
              <div class="load-band load-band-push" style="left:65%; width:10%;"></div>
              <div class="load-band load-band-spike" style="left:75%; width:25%;"></div>
              <div class="load-marker" style="left:${loadPos.toFixed(1)}%;"></div>
            </div>
            <div class="load-scale"><span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2+</span></div>
            <div class="tiny muted" style="margin-top:8px;">${LOAD_CAPTIONS[loadZone]}</div>
            <div class="tiny muted" style="margin-top:4px;">This week ÷ 4-week average training load (acute : chronic workload ratio) · tap for the numbers</div>
          </div>
        </div>
      ` : ""}

      ${stim.length ? `
        <div class="section">
          <h3>Muscle stimulus</h3>
          <div class="card">
            ${stim.map((v) => {
              const pct = Math.min(100, (v.perWeek / 24) * 100);
              return `
              <div class="muscle-vol-row card-tap" data-action="info-muscle-stim" data-muscle="${escapeHtml(v.muscle)}">
                <span class="muscle-vol-name">${escapeHtml(v.muscle)}</span>
                <span class="muscle-vol-track stim-track">
                  <span class="stim-band" style="left:${(STIM_MEV / 24) * 100}%; width:${((STIM_MRV - STIM_MEV) / 24) * 100}%;"></span>
                  <span class="muscle-vol-fill stim-fill stim-${v.zone}" style="width:${pct.toFixed(1)}%"></span>
                </span>
                <span class="muscle-vol-count">${v.perWeek < 10 ? v.perWeek.toFixed(1) : Math.round(v.perWeek)}</span>
              </div>`;
            }).join("")}
            <div class="stim-legend tiny muted">
              <span><i class="stim-dot stim-low"></i>&lt;${STIM_MEV} building</span>
              <span><i class="stim-dot stim-optimal"></i>${STIM_MEV}–${STIM_MRV} growth zone</span>
              <span><i class="stim-dot stim-high"></i>&gt;${STIM_MRV} very high</span>
            </div>
            <div class="tiny muted" style="margin-top:6px;">Avg fractional sets per muscle per week, last 4 weeks (1 per set for the target muscle, 0.5 for helpers). The shaded band is the ~${STIM_MEV}–${STIM_MRV} set hypertrophy zone (MEV→MRV).</div>
          </div>
        </div>
      ` : ""}

      ${axes.some((a) => a.current != null) ? `
        <div class="section">
          <h3>Effort profile · 4wk</h3>
          <div class="card">
            ${axes.filter((a) => a.current != null).map((a) => {
              const delta = a.previous != null ? Math.round(a.current - a.previous) : null;
              return `
              <div class="muscle-vol-row">
                <span class="muscle-vol-name">${AXIS_LABELS[a.axis]}</span>
                <span class="muscle-vol-track"><span class="muscle-vol-fill" style="width:${Math.round(a.current)}%"></span></span>
                <span class="az-axis-num">${Math.round(a.current)}${delta != null && delta !== 0 ? `<span class="az-delta ${delta > 0 ? "up" : "down"}">${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}</span>` : ""}</span>
              </div>`;
            }).join("")}
            <div class="tiny muted" style="margin-top:8px;">Average score per effort axis over the last 4 weeks${axes.some((a) => a.previous != null) ? "; arrows vs. the 4 weeks before" : ""}.</div>
          </div>
        </div>
      ` : ""}

      ${renderAnalyticsLevelsHtml()}

      ${prs.length ? `
        <div class="section">
          <h3>Recent PRs</h3>
          ${prs.map((p) => {
            const ex = exerciseById(p.exerciseId);
            return `
            <div class="list-row card-tap" data-action="view-exercise" data-id="${p.exerciseId}">
              <div>
                <div class="row-title">${ex ? escapeHtml(ex.name) : "Exercise"}</div>
                <div class="tiny muted">${fmtDate(p.date)}</div>
              </div>
              <span class="badge badge-success">${weightToDisplay(p.weight)} ${unitLabel()} × ${p.reps}</span>
            </div>`;
          }).join("")}
        </div>
      ` : ""}
    `;

    if (e1rmData.length >= 2) {
      initProgressChart(document.getElementById("progress-chart"), e1rmData, (v) => `${roundClean(v)} ${unitLabel()} e1RM`);
    }
  }

  function renderStrengthLevelCard(ex) {
    const std = strengthStandardFor(ex);
    if (!std) return "";
    if (!(bodyWeightOn() > 0)) {
      return `<div class="card lvl-card"><h3>Strength level</h3><div class="small muted">Log your bodyweight in Settings to see where your ${escapeHtml(ex.name.toLowerCase())} ranks.</div></div>`;
    }
    const r = bestStrengthRank(ex.id);
    if (!r) {
      return `<div class="card lvl-card"><h3>Strength level</h3><div class="small muted">Log a working set${std.unit === "lb" ? ` of ${RANK_MAX_REPS} reps or fewer` : ""} to get ranked.</div></div>`;
    }
    const what = r.unit === "reps" ? "Best set" : "Best e1RM";
    return `
      <div class="card lvl-card">
        <div class="row" style="align-items:center;">
          <h3 style="margin:0;">Strength level</h3>
          ${levelBadgeHtml(r)}
        </div>
        <div class="lvl-headline">${r.belowBeginner ? "Building toward Beginner" : `Stronger than ~${Math.round(r.pctl)}% of lifters`}</div>
        <div class="tiny muted">${what} ${rankValueLabel(r, r.value)} (${weightToDisplay(r.set.weight)} ${unitLabel()} × ${r.set.reps}, ${fmtDate(r.date)}) at ${Math.round(weightToDisplay(r.bodyWeight))} ${unitLabel()} bodyweight</div>
        ${levelLadderHtml(r)}
        ${r.next ? `<div class="small" style="margin-top:10px;">Next: <b>${r.next.level}</b> at ${rankValueLabel(r, r.next.target)} <span class="muted">(+${rankValueLabel(r, Math.max(0, r.next.gap))})</span></div>` : `<div class="small" style="margin-top:10px;"><b>Elite.</b> Top 5% of lifters for this lift.</div>`}
        <div class="tiny muted" style="margin-top:6px;">Male standards from strengthlevel.com community lifts. Beginner/Novice/Intermediate/Advanced/Elite = stronger than 5/20/50/80/95% of lifters.</div>
      </div>`;
  }

  function renderDifficultyCard(ex) {
    const d = difficultyInfo(ex);
    if (!d) return "";
    const parts = d.parts
      ? `Muscle mass ${d.parts.m}/3 · Spinal load ${d.parts.a}/2 · Skill ${d.parts.s}/2`
      : "Estimated from the exercise's muscle group, equipment and name";
    // Personal adjustments: height (range of motion) and bodyweight (body
    // mass moved), shown at your best recent working weight.
    const bw = bodyWeightOn();
    const hf = heightRomFactor(ex, state.settings.heightIn);
    const refLoad = bestWeightFor(ex.id) || 0;
    const bf = bodyMassWorkFactor(ex, refLoad, bw);
    const pctTxt = (f) => `${f >= 1 ? "+" : "−"}${Math.abs((f - 1) * 100).toFixed(1)}%`;
    const bits = [];
    if (state.settings.heightIn && hf !== 1) bits.push(`height ${pctTxt(hf)} (range of motion)`);
    if (bf !== 1) bits.push(`bodyweight ${pctTxt(bf)} (body mass moved${refLoad ? ` at ${weightToDisplay(refLoad)} ${unitLabel()}` : ""})`);
    if (ex.equipment === "Bodyweight") bits.push(`your ${Math.round(weightToDisplay(bw || DEFAULT_BODYWEIGHT_LB))} ${unitLabel()} bodyweight is the load`);
    const personal = bits.length
      ? `<div class="small" style="margin-top:8px;">For you: ${bits.join(" · ")} → ×${(d.factor * hf * bf).toFixed(2)}</div>`
      : (!state.settings.heightIn ? `<div class="tiny muted" style="margin-top:6px;">Add your height in Settings to adjust for range of motion.</div>` : "");
    return `
      <div class="card lvl-card">
        <div class="row" style="align-items:center;">
          <h3 style="margin:0;">Difficulty</h3>
          <span>${tierChipHtml(ex)} <span class="small muted">${d.points}/10</span></span>
        </div>
        <div class="tiny muted" style="margin-top:6px;">${parts}. Base ×${d.factor.toFixed(2)} toward your effort score.</div>
        ${personal}
      </div>`;
  }

  function renderExerciseDetail(params) {
    const ex = exerciseById(params.id);
    if (!ex) { navigate("history", { tab: "exercises" }); return; }
    const history = [];
    for (const w of state.workouts) {
      const e = w.exercises.find((x) => x.exerciseId === ex.id);
      if (e) {
        const completed = e.sets.filter((s) => s.completed);
        if (completed.length) history.push({ date: w.date, sets: completed, workingSets: completed.filter((s) => !s.isWarmup) });
      }
    }
    let bestSet = null, bestE1rm = 0;
    history.forEach((h) => h.workingSets.forEach((s) => {
      const e1rm = estOneRm(s.weight, s.reps);
      if (e1rm > bestE1rm) { bestE1rm = e1rm; bestSet = s; }
    }));

    const chartData = history.filter((h) => h.workingSets.length).slice(0, 12).reverse()
      .map((h) => {
        const maxLb = Math.max(...h.workingSets.map((s) => s.weight || 0));
        return { date: h.date, value: displayUnit() === "kg" ? lbToKg(maxLb) : maxLb };
      });

    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="back">‹ Back</button>
      </div>
      <h1>${escapeHtml(ex.name)}</h1>
      <div class="small muted" style="margin-top:-12px; margin-bottom:16px;">${ex.muscle} · ${ex.equipment}</div>

      ${renderStrengthLevelCard(ex)}
      ${renderDifficultyCard(ex)}

      ${bestSet ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-label">Best set</div>
            <div class="stat-value">${weightToDisplay(bestSet.weight)} ${unitLabel()} × ${bestSet.reps}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Est. 1RM</div>
            <div class="stat-value">${Math.round(weightToDisplay(bestE1rm))} ${unitLabel()}</div>
          </div>
        </div>
        ${(() => {
          const sg = progressionSuggestion(ex.id);
          if (!sg) return "";
          return sg.bumped
            ? `<div class="suggest-card"><span class="suggest-icon">▲</span><div><div class="suggest-title">Try ${weightToDisplay(sg.next)} ${unitLabel()} next</div><div class="tiny muted">Last set ${weightToDisplay(sg.last)} ${unitLabel()} × ${sg.reps} looked manageable — small jump up.</div></div></div>`
            : `<div class="suggest-card suggest-hold"><span class="suggest-icon">→</span><div><div class="suggest-title">Repeat ${weightToDisplay(sg.last)} ${unitLabel()}</div><div class="tiny muted">Groove ${weightToDisplay(sg.last)} ${unitLabel()} again before adding load.</div></div></div>`;
        })()}
        <div class="chart-wrap">${renderLineChart(chartData, { label: "Weight progress over recent sessions" })}</div>
      ` : emptyStateHtml("No history yet", "Log this exercise in a workout to see progress.", "history")}

      ${history.length ? `
        <h3>History</h3>
        ${history.map((h) => `
          <div class="list-row">
            <span class="muted small">${fmtDate(h.date)}</span>
            <span class="small">${h.sets.map((s) => `${s.isWarmup ? "W " : ""}${weightToDisplay(s.weight)}×${s.reps}`).join(", ")}</span>
          </div>
        `).join("")}
      ` : ""}
    `;

    if (bestSet && chartData.length >= 2) initProgressChart(document.getElementById("progress-chart"), chartData, (v) => `${roundClean(v)} ${unitLabel()}`);
  }

  // Catmull-Rom -> cubic Bezier smoothing, so the trend line reads as one
  // continuous, crisp curve instead of a jagged connect-the-dots line.
  function smoothPathD(pts) {
    if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  }

  // Compact axis-free trend line for embedding inside a hero card (see
  // .hero-card-spark) — reference: the thin chart woven into the bottom
  // edge of every Outsiders metric card. `values` is a plain number
  // array, oldest -> newest; `color` is any CSS color string.
  function renderSparkline(values, color) {
    if (!values || values.length < 2) return "";
    const W = 300, H = 56, pad = 3;
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max - min) || Math.max(max, 1) * 0.1 || 1;
    const stepX = (W - pad * 2) / (values.length - 1);
    const coords = values.map((v, i) => [
      pad + i * stepX,
      pad + (1 - (v - min) / range) * (H - pad * 2),
    ]);
    const lineD = smoothPathD(coords);
    const areaD = `${lineD} L${coords[coords.length - 1][0].toFixed(2)},${H} L${coords[0][0].toFixed(2)},${H} Z`;
    const gid = `spark${Math.random().toString(36).slice(2, 8)}`;
    return `
      <div class="hero-card-spark">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.45" />
              <stop offset="100%" stop-color="${color}" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="${areaD}" fill="url(#${gid})" stroke="none" />
          <path d="${lineD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `;
  }

  // Renders a value-over-time trend chart. `data` is [{date, value}] with
  // values already in display units. Teal always encodes the value (the
  // line + y-axis), orange always encodes time (ticks, date labels, the
  // drag cursor) — colors sampled from the app icon.
  function renderLineChart(data, opts = {}) {
    if (data.length < 2) {
      return `<div class="chart-empty">Log one more session to see your trend</div>`;
    }
    const W = 320, H = 176, padX = 14, padTop = 18, padBottom = 34;
    const baseY = H - padBottom;
    const disp = data.map((d) => d.value);
    const min = Math.min(...disp), max = Math.max(...disp);
    const range = (max - min) || Math.max(max, 1) * 0.1 || 1;
    const padRange = range * 0.18;
    const lo = min - padRange, hi = max + padRange;
    const span = hi - lo || 1;
    const stepX = (W - padX * 2) / (data.length - 1);
    const coords = disp.map((v, i) => [
      padX + i * stepX,
      padTop + (1 - (v - lo) / span) * (baseY - padTop),
    ]);

    const lineD = smoothPathD(coords);
    const areaD = `${lineD} L${coords[coords.length - 1][0].toFixed(2)},${baseY} L${coords[0][0].toFixed(2)},${baseY} Z`;

    const ticksAndDots = coords.map((c, i) => {
      const isEdge = i === 0 || i === coords.length - 1;
      const anchor = i === 0 ? "start" : i === coords.length - 1 ? "end" : "middle";
      return `
        <line x1="${c[0].toFixed(2)}" y1="${baseY}" x2="${c[0].toFixed(2)}" y2="${(baseY + 5).toFixed(2)}" class="chart-tick" />
        ${isEdge ? `<text x="${c[0].toFixed(2)}" y="${H - 8}" text-anchor="${anchor}" class="chart-date-label">${escapeHtml(fmtDate(data[i].date))}</text>` : ""}
        <circle cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="3.4" class="chart-dot" data-i="${i}" style="--d:${i}" />
      `;
    }).join("");

    return `
      <div class="chart" id="progress-chart">
        <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(opts.label || "Progress over recent sessions")}">
          <defs>
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--chart-weight)" stop-opacity="0.30" />
              <stop offset="100%" stop-color="var(--chart-weight)" stop-opacity="0" />
            </linearGradient>
            <filter id="chartGlowBlur" x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation="3.4" />
            </filter>
          </defs>
          <line x1="${padX}" y1="${baseY}" x2="${W - padX}" y2="${baseY}" class="chart-baseline" />
          <path d="${areaD}" class="chart-area" />
          <path d="${lineD}" class="chart-line-glow" />
          <path d="${lineD}" class="chart-line" />
          ${ticksAndDots}
          <g class="chart-cursor">
            <line class="chart-cursor-line" x1="0" y1="${padTop}" x2="0" y2="${baseY}" />
            <circle class="chart-cursor-dot" r="5" cx="0" cy="0" />
          </g>
        </svg>
        <div class="chart-tooltip"></div>
      </div>
    `;
  }

  // Wires up entrance animation + drag/hover interactivity for the chart
  // rendered by renderLineChart. Runs once, right after the markup above
  // is inserted into the DOM.
  function initProgressChart(container, data, format) {
    if (!container) return;
    const svg = container.querySelector(".chart-svg");
    const line = svg.querySelector(".chart-line");
    const glow = svg.querySelector(".chart-line-glow");
    const area = svg.querySelector(".chart-area");
    const dots = Array.from(svg.querySelectorAll(".chart-dot"));
    const cursor = svg.querySelector(".chart-cursor");
    const cursorLine = svg.querySelector(".chart-cursor-line");
    const cursorDot = svg.querySelector(".chart-cursor-dot");
    const tooltip = container.querySelector(".chart-tooltip");

    // Draw-on entrance: animate the line (and its glow) from fully hidden
    // to fully revealed via stroke-dashoffset, a crisp "drawing" motion.
    const len = line.getTotalLength();
    [line, glow].forEach((p) => {
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    // Force layout so the initial dash state is committed before animating.
    void line.getBoundingClientRect();
    requestAnimationFrame(() => {
      [line, glow].forEach((p) => {
        p.style.transition = "stroke-dashoffset 0.75s cubic-bezier(0.65, 0, 0.35, 1)";
        p.style.strokeDashoffset = "0";
      });
      requestAnimationFrame(() => area.classList.add("in"));
    });

    const dotCx = dots.map((d) => parseFloat(d.getAttribute("cx")));
    const dotCy = dots.map((d) => parseFloat(d.getAttribute("cy")));
    let activeIndex = -1;

    function nearestIndex(svgX) {
      let best = 0, bestDist = Infinity;
      dotCx.forEach((x, i) => {
        const dist = Math.abs(x - svgX);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      return best;
    }

    function showAt(i) {
      if (i === activeIndex) return;
      const changed = activeIndex !== -1;
      activeIndex = i;
      dots.forEach((d, di) => d.classList.toggle("active", di === i));
      cursorLine.setAttribute("x1", dotCx[i]);
      cursorLine.setAttribute("x2", dotCx[i]);
      cursorDot.setAttribute("cx", dotCx[i]);
      cursorDot.setAttribute("cy", dotCy[i]);
      cursor.classList.add("visible");

      const label = format ? format(data[i].value) : roundClean(data[i].value);
      tooltip.innerHTML = `<span class="tt-weight">${label}</span><span class="tt-date">${escapeHtml(fmtDate(data[i].date))}</span>`;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / 320, scaleY = rect.height / 176;
      tooltip.style.left = `${dotCx[i] * scaleX}px`;
      tooltip.style.top = `${dotCy[i] * scaleY}px`;
      tooltip.classList.add("visible");
      if (changed) vibrateTap();
    }

    function hideCursor() {
      activeIndex = -1;
      dots.forEach((d) => d.classList.remove("active"));
      cursor.classList.remove("visible");
      tooltip.classList.remove("visible");
    }

    function svgXFromClientX(clientX) {
      const rect = svg.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * 320;
    }

    function onMove(e) {
      const x = svgXFromClientX(e.clientX);
      showAt(nearestIndex(x));
    }

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      onMove(e);
    });
    svg.addEventListener("pointermove", (e) => { if (e.pressure > 0 || e.pointerType === "mouse") onMove(e); });
    svg.addEventListener("pointerup", hideCursor);
    svg.addEventListener("pointerleave", hideCursor);
    svg.addEventListener("pointercancel", hideCursor);
  }

  // Plate denominations offered as toggles in Settings (lb).
  const PLATE_OPTIONS_LB = [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25];

  // Profile photo: downscaled to a max 320px square JPEG before storage —
  // a raw camera-roll photo as a data URL can be several MB, which is
  // wasteful for an avatar that only ever renders at a few dozen pixels.
  function updateProfileBtnAvatar() {
    const img = document.getElementById("profile-btn-img");
    const icon = document.getElementById("profile-btn-icon");
    if (state.profilePhoto) {
      img.src = state.profilePhoto;
      img.classList.remove("hidden");
      icon.classList.add("hidden");
    } else {
      img.classList.add("hidden");
      icon.classList.remove("hidden");
    }
  }

  function handleProfilePhotoFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 320;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        state.profilePhoto = dataUrl;
        DB.kvSet("profilePhoto", dataUrl);
        updateProfileBtnAvatar();
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.getElementById("profile-photo-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleProfilePhotoFile(file);
    e.target.value = "";
  });

  function renderProfile() {
    const sessions = allSessions();
    const earliest = sessions.length ? sessions.reduce((a, b) => new Date(a.date) < new Date(b.date) ? a : b) : null;
    appEl.innerHTML = `
      <div class="topbar"><button class="back-btn" data-action="back">‹ Back</button></div>
      <div class="profile-avatar-row">
        <button class="profile-avatar-big" data-action="change-photo" aria-label="Change profile photo">
          ${state.profilePhoto ? `<img src="${state.profilePhoto}" alt="" />` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>`}
          <span class="profile-avatar-edit">${state.profilePhoto ? "Change photo" : "Add photo"}</span>
        </button>
      </div>
      <div class="metric-tiles" style="margin-top:4px;">
        <div class="metric-tile"><span class="metric-tile-dot" style="background:var(--accent);"></span><span class="metric-tile-label">Total sessions</span><div class="metric-tile-value">${sessions.length}</div></div>
        <div class="metric-tile"><span class="metric-tile-dot" style="background:var(--success);"></span><span class="metric-tile-label">Streak</span><div class="metric-tile-value">${weekStreak()} wk</div></div>
      </div>
      ${earliest ? `<div class="tiny muted" style="text-align:center; margin:-4px 0 16px;">Training since ${fmtDate(earliest.date)}</div>` : ""}
      <div class="section">
        <div class="list-row card-tap" data-action="go-settings">
          <div class="row-title">Settings</div>
          <span class="muted">›</span>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const s = state.settings;
    const bwData = (s.bodyWeightLog || []).slice(-12).map((e) => ({ date: e.date, value: displayUnit() === "kg" ? lbToKg(e.lb) : e.lb }));
    appEl.innerHTML = `
      <div class="topbar"><button class="back-btn" data-action="back">‹ Back</button></div>
      <h1>Settings</h1>

      <div class="section">
        <h3>Units</h3>
        <div class="card">
          <div class="row" style="margin-bottom:${s.unitMode === "both" ? "12px" : "0"};">
            <span>Weight unit</span>
            <div class="segmented" style="width:160px;">
              <button data-action="set-unit-mode" data-mode="lb" class="${s.unitMode === "lb" ? "active" : ""}">lb</button>
              <button data-action="set-unit-mode" data-mode="kg" class="${s.unitMode === "kg" ? "active" : ""}">kg</button>
              <button data-action="set-unit-mode" data-mode="both" class="${s.unitMode === "both" ? "active" : ""}">Both</button>
            </div>
          </div>
          ${s.unitMode === "both" ? `
            <div class="row">
              <span class="small muted">Currently showing</span>
              <div class="segmented" style="width:160px;">
                <button data-action="set-active-unit" data-unit="lb" class="${s.activeUnit === "lb" ? "active" : ""}">lb</button>
                <button data-action="set-active-unit" data-unit="kg" class="${s.activeUnit === "kg" ? "active" : ""}">kg</button>
              </div>
            </div>` : ""}
        </div>
      </div>

      <div class="section">
        <h3>Body profile</h3>
        <div class="card">
          <div class="row">
            <span>Your body weight</span>
            <div class="row-gap">
              <input type="text" inputmode="decimal" id="bodyweight-input" data-action="set-bodyweight"
                value="${currentBodyWeightLb() ? weightToDisplay(currentBodyWeightLb()) : ""}" placeholder="${DEFAULT_BODYWEIGHT_LB}"
                style="width:64px; text-align:right; font-weight:700; border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 8px; background:var(--surface);" />
              <span class="muted small">${unitLabel()}</span>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px; margin-bottom:${bwData.length >= 2 ? "12px" : "12px"};">Updating this logs a dated entry so you can track your weight over time. Feeds your effort score three ways: it's the load on bodyweight moves (push-ups, pull-ups), it adds the body mass you move on squats, lunges and hinges, and your Strength axis/level is judged against lifters your bodyweight. Without it we assume ${DEFAULT_BODYWEIGHT_LB} lb for loads and skip strength levels.</div>
          ${bwData.length >= 2 ? `<div class="chart-wrap" style="margin-bottom:12px;">${renderLineChart(bwData, { label: "Body weight over recent entries" })}</div>` : ""}
          <div class="row" style="border-top:1px solid var(--border); padding-top:12px;">
            <span>Your height</span>
            <div class="row-gap">
              <input type="text" inputmode="decimal" id="height-input" data-action="set-height"
                value="${s.heightIn ? heightToDisplay(s.heightIn) : ""}" placeholder="${heightUnitLabel() === "cm" ? "173" : "68"}"
                style="width:64px; text-align:right; font-weight:700; border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 8px; background:var(--surface);" />
              <span class="muted small">${heightUnitLabel()}</span>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px;">Adjusts effort for range of motion — taller lifters move the weight farther per rep (±0.5% per inch from 5'8"): fully on squats, deadlifts, lunges and cleans, 60% on presses, rows and pull-ups. Isolation exercises aren't affected. Leaving this blank skips the adjustment entirely.</div>
        </div>
      </div>

      <div class="section">
        <h3>Workout</h3>
        <div class="card">
          <div class="row">
            <span>Log RPE per set</span>
            <div class="segmented" style="width:120px;">
              <button data-action="set-rpe-visible" data-value="on" class="${s.showRpe ? "active" : ""}">On</button>
              <button data-action="set-rpe-visible" data-value="off" class="${s.showRpe ? "" : "active"}">Off</button>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px;">Adds an RPE column (5–10) to each set. Logged RPE also sharpens your effort score's Muscle axis instead of estimating from the bar weight.</div>
          <div class="row" style="border-top:1px solid var(--border); padding-top:12px;">
            <span>Rest timer</span>
            <div class="segmented" style="width:120px;">
              <button data-action="set-rest-enabled" data-value="on" class="${s.restTimerEnabled ? "active" : ""}">On</button>
              <button data-action="set-rest-enabled" data-value="off" class="${s.restTimerEnabled ? "" : "active"}">Off</button>
            </div>
          </div>
          ${s.restTimerEnabled ? `
            <div class="row" style="margin-top:12px;">
              <span class="small muted">Length</span>
              <div class="segmented" style="width:220px;">
                ${[60, 90, 120, 180].map((sec) => `<button data-action="set-rest-sec" data-sec="${sec}" class="${(s.restTimerSec || 120) === sec ? "active" : ""}">${sec < 120 ? sec + "s" : (sec / 60) + "m"}</button>`).join("")}
              </div>
            </div>` : ""}
          <div class="tiny muted" style="margin-top:8px;">Off by default. When on, a countdown starts automatically after you complete a working set.</div>
        </div>
      </div>

      <div class="section">
        <h3>Plate calculator</h3>
        <div class="card">
          <div class="row">
            <span>Barbell weight</span>
            <div class="row-gap">
              <input type="text" inputmode="decimal" id="bar-weight-input" data-action="set-bar-weight"
                value="${weightToDisplay(s.barWeightLb || 45)}"
                style="width:64px; text-align:right; font-weight:700; border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 8px; background:var(--surface);" />
              <span class="muted small">${unitLabel()}</span>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:10px; margin-bottom:8px;">Available plates (per side):</div>
          <div class="plate-chip-row">
            ${PLATE_OPTIONS_LB.map((p) => `<button class="chip ${(s.platesLb || []).includes(p) ? "chip-selected" : ""}" data-action="toggle-plate" data-plate="${p}">${weightToDisplay(p)}</button>`).join("")}
          </div>
          <div class="tiny muted" style="margin-top:10px;">Tap the barbell icon on any exercise during a workout to see the plates to load.</div>
        </div>
      </div>

      <div class="section">
        <h3>Haptics</h3>
        <div class="card">
          <div class="row">
            <span>Vibrate on tap</span>
            <div class="segmented" style="width:120px;">
              <button data-action="set-haptics" data-value="on" class="${s.hapticsEnabled !== false ? "active" : ""}">On</button>
              <button data-action="set-haptics" data-value="off" class="${s.hapticsEnabled === false ? "active" : ""}">Off</button>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px;">Works on Android. iPhone Safari doesn't give web apps access to haptics, so this has no effect on iOS.</div>
        </div>
      </div>

      <div class="section">
        <h3>Data</h3>
        <div class="card">
          <button class="btn" data-action="export-data" style="margin-bottom:8px;">Export backup (JSON)</button>
          <button class="btn" data-action="export-csv" style="margin-bottom:8px;">Export sets (CSV)</button>
          <button class="btn" data-action="import-data" style="margin-bottom:8px;">Restore from backup</button>
          <input type="file" id="import-file-input" data-action="import-file" accept="application/json,.json" style="display:none;" />
          <button class="btn btn-danger" data-action="reset-data">Erase all data</button>
          <div class="tiny muted" style="margin-top:8px;">Your workouts live only on this device's browser storage — they're never uploaded anywhere, including the app's GitHub repo. Export a backup periodically (or before switching phones/browsers) so you always have a copy you control. CSV opens in any spreadsheet.</div>
        </div>
      </div>
    `;
    if (bwData.length >= 2) initProgressChart(document.getElementById("progress-chart"), bwData, (v) => `${roundClean(v)} ${unitLabel()}`);
  }

  // Migrates a routine exercise to the current shape (an explicit list of
  // sets, each with its own weight/reps and a warmup flag, plus a free-text
  // note) so older routines saved before this shape existed still load and
  // edit correctly. Mutates and returns `re`.
  function normalizeRoutineExercise(re) {
    if (!Array.isArray(re.sets)) {
      const n = re.targetSets || 3;
      const w = re.targetWeight === "" || re.targetWeight == null ? "" : re.targetWeight;
      re.sets = Array.from({ length: n }, () => ({ weight: w, reps: "", isWarmup: false }));
      delete re.targetSets;
      delete re.targetWeight;
    }
    if (re.note == null) re.note = "";
    return re;
  }

  function renderRoutineEdit(params) {
    let draft = renderRoutineEdit._draft;
    if (!draft || draft.id !== params.id) {
      const existing = state.routines.find((r) => r.id === params.id);
      draft = existing ? { ...existing, exercises: existing.exercises.map((re) => normalizeRoutineExercise({ ...re, sets: re.sets ? re.sets.map((s) => ({ ...s })) : undefined })) }
        : { id: params.id, name: "New routine", exercises: [] };
      renderRoutineEdit._draft = draft;
    }

    const u = unitLabel();

    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="back">‹ Back</button>
        <button class="btn btn-sm btn-primary" data-action="save-routine" data-id="${draft.id}">Save</button>
      </div>
      <input type="text" id="routine-name" class="title-input" value="${escapeHtml(draft.name)}" />

      <div id="routine-exercises">
        ${draft.exercises.map((re, i) => {
          const ex = exerciseById(re.exerciseId);
          let workingNum = 0;
          return `
          <div class="exercise-block">
            <div class="ex-header">
              <div>
                <div class="ex-title">${ex ? escapeHtml(ex.name) : "Unknown"}</div>
                ${re.note ? `<div class="ex-note">${escapeHtml(re.note)}</div>` : ""}
              </div>
              <div class="ex-header-actions">
                <button class="ex-menu-btn" data-action="routine-ex-menu" data-index="${i}" aria-label="Exercise options">${ICONS.kebab}</button>
              </div>
            </div>
            <table class="set-table">
              <tr><th>Set</th><th>${u}</th><th>Reps</th><th></th></tr>
              ${re.sets.map((s, si) => {
                const label = s.isWarmup ? "W" : ++workingNum;
                return `
                <tr class="set-row ${s.isWarmup ? "warmup" : ""}">
                  <td class="set-num">${label}</td>
                  <td><input class="set-input" inputmode="decimal" type="number" step="0.5" data-action="routine-set-weight" data-index="${i}" data-setidx="${si}" value="${s.weight === "" || s.weight == null ? "" : weightToDisplay(s.weight)}" placeholder="0" /></td>
                  <td><input class="set-input" inputmode="numeric" type="number" step="1" data-action="routine-set-reps" data-index="${i}" data-setidx="${si}" value="${s.reps === "" || s.reps == null ? "" : s.reps}" placeholder="0" /></td>
                  <td><button class="set-remove-btn" data-action="remove-routine-set" data-index="${i}" data-setidx="${si}" aria-label="Remove set">${ICONS.close}</button></td>
                </tr>
              `; }).join("")}
            </table>
            <button class="icon-btn" style="width:100%;" data-action="add-routine-set" data-index="${i}">+ Add set</button>
          </div>`;
        }).join("")}
      </div>
      <button class="fab-add" data-action="add-routine-exercise">+ Add exercise</button>
      ${draft.exercises.length ? `<button class="btn btn-danger" style="margin-top:16px;" data-action="delete-routine" data-id="${draft.id}">Delete routine</button>` : ""}
    `;

    document.getElementById("routine-name").addEventListener("change", (e) => { draft.name = e.target.value || "Routine"; });
  }

  function renderWorkoutActive() {
    const w = state.activeWorkout;
    if (!w) { navigate("home"); return; }
    appEl.innerHTML = `
      <div class="topbar topbar-sticky">
        <button class="back-btn" data-action="discard-workout">Discard</button>
        <span class="workout-clock" id="workout-elapsed">${fmtTime((Date.now() - new Date(w.startedAt).getTime()) / 1000)}</span>
        <button class="btn btn-sm btn-primary" data-action="finish-workout">Finish</button>
      </div>
      <input type="text" id="workout-name" class="title-input" value="${escapeHtml(w.name)}" />

      <div id="workout-exercises">
        ${w.exercises.map((ex, exIdx) => renderExerciseBlock(ex, exIdx, supersetInfoFor(w.exercises, exIdx))).join("")}
      </div>

      <button class="fab-add" data-action="add-workout-exercise">+ Add exercise</button>
    `;
    document.getElementById("workout-name").addEventListener("change", (e) => {
      w.name = e.target.value || "Workout";
      saveActiveWorkout();
    });
    startWorkoutClock();
  }

  // ---------- Live workout duration clock ----------
  // Ticks the elapsed-time readout in the workout-active topbar once a
  // second. Re-queries the element by id on every tick rather than holding
  // a reference, since render() rebuilds #app's innerHTML on every
  // navigation/edit and would otherwise leave the interval pointing at a
  // detached node. Elapsed time is always derived from the real
  // `startedAt` timestamp (not accumulated tick-by-tick), so it stays
  // correct even if the app was closed and reopened mid-workout.
  let workoutClockInterval = null;

  function startWorkoutClock() {
    if (workoutClockInterval) return;
    workoutClockInterval = setInterval(() => {
      const w = state.activeWorkout;
      if (!w) { stopWorkoutClock(); return; }
      const el = document.getElementById("workout-elapsed");
      if (!el) return; // navigated away from workout-active; keep ticking quietly
      el.textContent = fmtTime((Date.now() - new Date(w.startedAt).getTime()) / 1000);
    }, 1000);
  }

  function stopWorkoutClock() {
    if (workoutClockInterval) { clearInterval(workoutClockInterval); workoutClockInterval = null; }
  }

  // Label + CSS class for a set's number cell based on its type.
  function setTypeLabel(s, workingNum) {
    if (s.isWarmup) return { text: "W", cls: "warmup" };
    if (s.type === "drop") return { text: "D", cls: "dropset" };
    if (s.type === "failure") return { text: "F", cls: "failure" };
    return { text: String(workingNum), cls: "" };
  }

  // Superset membership for the exercise at exIdx: only adjacent exercises
  // sharing the same supersetId form a group. Returns {letter, first, last}
  // or null when the exercise isn't in a (multi-member) superset.
  function supersetInfoFor(exercises, exIdx) {
    const id = exercises[exIdx] && exercises[exIdx].supersetId;
    if (!id) return null;
    // Find the contiguous run of this supersetId around exIdx.
    let start = exIdx, end = exIdx;
    while (start > 0 && exercises[start - 1].supersetId === id) start--;
    while (end < exercises.length - 1 && exercises[end + 1].supersetId === id) end++;
    if (end === start) return null; // a lone member isn't really a superset
    const letter = "ABCDEFGH"[exIdx - start] || "•";
    return { letter, first: exIdx === start, last: exIdx === end };
  }

  function renderExerciseBlock(ex, exIdx, ssInfo) {
    const u = unitLabel();
    const showRpe = !!state.settings.showRpe;
    let workingNum = 0;
    const topWeight = Math.max(0, ...ex.sets.filter((s) => !s.isWarmup).map((s) => s.weight || 0));
    // Plate math (bar + pairs of plates per side) only makes sense for
    // barbell-loaded lifts — dumbbells, machines, cables, bodyweight, etc.
    // don't load a bar, so the calculator is hidden for those.
    const exMeta = exerciseById(ex.exerciseId);
    const isBarbell = exMeta && exMeta.equipment === "Barbell";
    const sugg = progressionSuggestion(ex.exerciseId);
    const ssChip = ssInfo ? `<span class="ss-chip">${ssInfo.letter}</span>` : "";
    const ssClass = ssInfo ? `superset-member ${ssInfo.first ? "superset-first" : ""} ${ssInfo.last ? "superset-last" : ""}` : "";
    return `
      <div class="exercise-block ${ssClass}" data-exidx="${exIdx}">
        <div class="ex-header">
          <button class="ex-drag-handle" data-exidx="${exIdx}" aria-label="Press and hold to reorder">${ICONS.grip}</button>
          <div class="ex-header-main">
            <div class="ex-title">${ssChip}${escapeHtml(ex.name)}</div>
            <div class="ex-setcount">${ex.sets.length} set${ex.sets.length === 1 ? "" : "s"}</div>
            ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ""}
            ${sugg && sugg.bumped ? `<div class="ex-suggest">▲ Suggested: ${weightToDisplay(sugg.next)} ${u} <span class="muted">(last ${weightToDisplay(sugg.last)}×${sugg.reps})</span></div>` : ""}
          </div>
          <div class="ex-header-actions">
            ${isBarbell && topWeight > 0 ? `<button class="ex-plate-btn" data-action="plate-calc" data-exidx="${exIdx}" aria-label="Plate calculator">${ICONS.barbell}</button>` : ""}
            <button class="ex-menu-btn" data-action="workout-ex-menu" data-exidx="${exIdx}" aria-label="Exercise options">${ICONS.kebab}</button>
          </div>
        </div>
        <table class="set-table">
          <tr><th>Set</th><th>Previous</th><th>${u}</th><th>Reps</th>${showRpe ? "<th>RPE</th>" : ""}<th></th></tr>
          ${ex.sets.map((s, setIdx) => {
            const isWarmup = !!s.isWarmup;
            if (!isWarmup) workingNum++;
            const tl = setTypeLabel(s, workingNum);
            const prevLabel = isWarmup ? "—" : previousSetLabel(ex.exerciseId, workingNum - 1);
            return `
            <tr class="set-row ${s.completed ? "completed" : ""} ${isWarmup ? "warmup" : ""}">
              <td><button class="set-num set-num-btn ${tl.cls}" data-action="set-type-menu" data-exidx="${exIdx}" data-setidx="${setIdx}" aria-label="Set type">${tl.text}</button></td>
              <td class="set-prev">${prevLabel}</td>
              <td><input class="set-input" inputmode="decimal" type="number" step="0.5" data-action="set-weight" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.weight === "" ? "" : weightToDisplay(s.weight)}" placeholder="—" /></td>
              <td><input class="set-input" inputmode="numeric" type="number" step="1" data-action="set-reps" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.reps === "" ? "" : s.reps}" placeholder="—" /></td>
              ${showRpe ? `<td class="rpe-cell"><input class="set-input rpe-input" inputmode="decimal" type="number" step="0.5" min="5" max="10" data-action="set-rpe" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.rpe == null ? "" : s.rpe}" placeholder="–" /></td>` : ""}
              <td><button class="set-check ${s.completed ? "checked" : ""}" data-action="toggle-set" data-exidx="${exIdx}" data-setidx="${setIdx}" aria-label="Mark set complete">${ICONS.check}</button></td>
            </tr>
          `; }).join("")}
        </table>
        <button class="icon-btn" data-action="add-set" data-exidx="${exIdx}">+ Add set</button>
      </div>
    `;
  }

  // Peak-End: the last thing someone sees when they finish a workout
  // shouldn't just be a toast — it's the "ending" moment, so it gets a
  // dedicated screen with a celebratory beat and a clear close.
  function renderWorkoutLevelsHtml(w) {
    const rows = w.exercises.map((e) => {
      const ex = exerciseById(e.exerciseId);
      const r = rankSets(ex, e.sets, w.date);
      return r ? { ex, r } : null;
    }).filter(Boolean);
    if (!rows.length) return "";
    return `
      <div class="card lvl-card" style="text-align:left;">
        <h3>Strength levels today</h3>
        ${rows.map(({ ex, r }) => `
          <div class="list-row card-tap" data-action="view-exercise" data-id="${ex.id}">
            <div>
              <div class="row-title">${escapeHtml(ex.name)}</div>
              <div class="tiny muted">${weightToDisplay(r.set.weight)} ${unitLabel()} × ${r.set.reps} · top ${Math.max(0.1, 100 - r.pctl) < 1 ? "1" : Math.round(100 - r.pctl)}%</div>
            </div>
            ${levelBadgeHtml(r)}
          </div>`).join("")}
      </div>`;
  }

  function renderWorkoutComplete(params) {
    const w = state.workouts.find((x) => x.id === params.id);
    if (!w) { navigate("home"); return; }
    const setCount = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    const hasPr = w.prCount > 0;
    const hasEffort = typeof w.effortScore === "number";
    appEl.innerHTML = `
      <div class="complete-wrap">
        <div class="complete-icon">${ICONS.check}</div>
        <div class="complete-title">Workout complete</div>
        <div class="complete-subtitle">${escapeHtml(w.name)} · ${fmtDate(w.date)}</div>
        ${hasEffort ? renderEffortRing(w.effortScore) : ""}
        ${hasEffort ? renderEffortBreakdown(w.effortBreakdown) : ""}
        ${hasPr ? `<div class="complete-pr-banner">${w.prCount} new PR${w.prCount > 1 ? "s" : ""} today</div>` : ""}
        <div class="complete-stats">
          <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${fmtDuration(w.durationSec)}</div></div>
          <div class="stat-card"><div class="stat-label">Volume</div><div class="stat-value">${totalVolume(w)} ${unitLabel()}</div></div>
          <div class="stat-card"><div class="stat-label">Sets logged</div><div class="stat-value">${setCount}</div></div>
          <div class="stat-card"><div class="stat-label">Exercises</div><div class="stat-value">${w.exercises.length}</div></div>
        </div>
        ${renderWorkoutLevelsHtml(w)}
        <div style="text-align:left; width:100%;">${renderTrainingCoachHtml({ title: "Coach notes", muscles: [...new Set(w.exercises.flatMap((e) => { const m = exerciseMuscles(exerciseById(e.exerciseId)); return m.p; }))], limit: 3, askClaude: true, alwaysShow: true })}</div>
        <div class="small muted" style="text-align:center;">${escapeHtml(effortCaption(hasEffort ? w.effortScore : 0, hasPr, workoutCoverage(w.exercises)))}</div>
        <div class="complete-actions">
          <button class="btn btn-primary" data-action="complete-done">Done</button>
        </div>
      </div>
    `;
    if (hasEffort) initEffortRing(document.getElementById("effort-ring"));
  }

  // Renders a circular progress ring (teal -> orange, matching the app
  // icon's palette) with the effort score centered inside it. Markup only
  // — call initEffortRing after inserting it into the DOM to animate the
  // fill and get a crisp "counting up" feel instead of popping in static.
  function renderEffortRing(score) {
    const r = 52, c = 2 * Math.PI * r;
    return `
      <div class="effort-ring-wrap" id="effort-ring" data-score="${score}">
        <svg viewBox="0 0 120 120" class="effort-ring-svg" role="img" aria-label="Effort score ${score} out of 100">
          <defs>
            <linearGradient id="effortRingGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--chart-weight)" />
              <stop offset="100%" stop-color="var(--chart-time)" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="${r}" class="effort-ring-track" />
          <circle cx="60" cy="60" r="${r}" class="effort-ring-progress" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" />
        </svg>
        <div class="effort-ring-center">
          <div class="effort-ring-value"><span class="effort-ring-num">0</span><span class="effort-ring-pct">%</span></div>
          <div class="effort-ring-label">Effort</div>
        </div>
      </div>
    `;
  }

  // The three-axis breakdown behind the blended score (see the effort
  // model comments above): how this session ranks against your best on
  // CNS intensity, muscle stimulus (effective reps), and work volume.
  function renderEffortBreakdown(b) {
    if (!b) return "";
    const rows = [
      { label: "Intensity", sub: "top-set RPE", value: b.intensity },
      { label: "Muscle", sub: "effective reps", value: b.muscle },
      { label: "Work", sub: "volume · INOL", value: b.volume },
    ];
    if (typeof b.strength === "number") rows.push({ label: "Strength", sub: "vs. lifters your bodyweight", value: b.strength });
    return `
      <div class="effort-breakdown">
        ${rows.map((r) => `
          <div class="effort-axis">
            <div class="effort-axis-head">
              <span class="effort-axis-label">${r.label} <span class="effort-axis-sub">${r.sub}</span></span>
              <span class="effort-axis-value">${Math.max(0, Math.min(100, r.value || 0))}%</span>
            </div>
            <div class="effort-axis-track"><div class="effort-axis-fill" style="width:${Math.max(0, Math.min(100, r.value || 0))}%"></div></div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function initEffortRing(container) {
    if (!container) return;
    const score = Math.max(0, Math.min(100, parseFloat(container.dataset.score) || 0));
    const circle = container.querySelector(".effort-ring-progress");
    const numEl = container.querySelector(".effort-ring-num");
    const r = 52, c = 2 * Math.PI * r;
    const target = c * (1 - score / 100);
    void container.getBoundingClientRect();
    requestAnimationFrame(() => {
      circle.style.transition = "stroke-dashoffset 0.9s cubic-bezier(0.65, 0, 0.35, 1)";
      circle.style.strokeDashoffset = `${target}`;
    });
    // Count the number up in step with the ring fill (~0.9s), respecting
    // reduced-motion by jumping straight to the final value.
    if (numEl) {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || score === 0) { numEl.textContent = String(score); return; }
      const start = performance.now(), dur = 900;
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic, matches the ring
        numEl.textContent = String(Math.round(eased * score));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  function renderWorkoutDetail(params) {
    const w = state.workouts.find((x) => x.id === params.id);
    if (!w) { navigate("history"); return; }
    appEl.innerHTML = `
      <div class="topbar"><button class="back-btn" data-action="back">‹ Back</button></div>
      <h1>${escapeHtml(w.name)}</h1>
      <div class="small muted" style="margin-top:-12px; margin-bottom:16px;">${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}${typeof w.effortScore === "number" ? ` · ${w.effortScore}% effort` : ""}${w.prCount ? ` · ${w.prCount} PR${w.prCount > 1 ? "s" : ""}` : ""}</div>
      ${w.exercises.map((ex) => {
        let workingNum = 0;
        const showRpe = ex.sets.some((s) => s.rpe != null);
        const lvl = rankSets(exerciseById(ex.exerciseId), ex.sets, w.date);
        return `
        <div class="exercise-block">
          <div class="ex-title">${escapeHtml(ex.name)} ${levelBadgeHtml(lvl)}</div>
          ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ""}
          <table class="set-table">
            <tr><th>Set</th><th>${unitLabel()}</th><th>Reps</th>${showRpe ? "<th>RPE</th>" : ""}</tr>
            ${ex.sets.map((s) => {
              if (!s.isWarmup) workingNum++;
              const tl = setTypeLabel(s, workingNum);
              return `<tr class="set-row ${s.isWarmup ? "warmup" : ""}"><td class="set-num ${tl.cls}">${tl.text}</td><td>${weightToDisplay(s.weight)}</td><td>${s.reps}</td>${showRpe ? `<td>${s.rpe == null ? "—" : s.rpe}</td>` : ""}</tr>`;
            }).join("")}
          </table>
        </div>
      `; }).join("")}
      <button class="btn btn-danger" style="margin-top:8px;" data-action="delete-workout" data-id="${w.id}">Delete workout</button>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Small, consistent icon set used in place of raw text glyphs (✓ × ⋯)
  // throughout the set tables and exercise menus — keeps the icon language
  // uniform instead of mixing characters with the app's SVG icons elsewhere.
  const ICONS = {
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    kebab: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
    barbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8.5" width="2.5" height="7" rx="1"/><rect x="5.5" y="6.5" width="2.5" height="11" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/><rect x="16" y="6.5" width="2.5" height="11" rx="1"/><rect x="19" y="8.5" width="2.5" height="7" rx="1"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    grip: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`,
  };

  const EMPTY_STATE_ICONS = {
    routines: `<path d="M4 7h16M4 12h10M4 17h13"/><circle cx="19" cy="7" r="1.3" fill="currentColor" stroke="none"/>`,
    workouts: `<rect x="3" y="9" width="4" height="6" rx="1"/><rect x="17" y="9" width="4" height="6" rx="1"/><line x1="7" y1="12" x2="17" y2="12"/>`,
    history: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
    search: `<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.3" y1="15.3" x2="20" y2="20"/>`,
  };

  function emptyStateHtml(title, message, icon) {
    const path = EMPTY_STATE_ICONS[icon] || EMPTY_STATE_ICONS.history;
    return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
        </div>
        <div class="big">${title}</div>
        ${message}
      </div>
    `;
  }

  // ---------- Sheet drag-to-dismiss ----------
  // Every bottom sheet (the confirm/menu/set-type/plate "card" sheets, plus
  // the exercise picker and new-exercise modal) can be dragged down from its
  // handle to dismiss, same as a native action sheet. A drag only starts
  // when the pointerdown target is inside `grabZoneSelector` (the visible
  // grabber pill, or the picker's topbar) — never from a tap on a button/
  // input/list row elsewhere in the sheet. `sheetSelector` is the element
  // that actually slides: a nested .confirm-card for the confirm-family
  // overlays, or null for the picker overlays (which slide as a whole,
  // there's no separate inner card). Dismissal re-triggers the overlay's
  // own [data-sheet-dismiss] control, so each overlay's existing close
  // logic (state cleanup, promise resolution, etc.) still runs as-is; this
  // utility only decides *when* to fire that click.
  function initSheetDrag(overlaySelector, sheetSelector, grabZoneSelector) {
    document.body.addEventListener("pointerdown", (e) => {
      const overlay = e.target.closest(overlaySelector);
      if (!overlay || !overlay.classList.contains("open")) return;
      if (!e.target.closest(grabZoneSelector)) return;
      const sheet = sheetSelector ? overlay.querySelector(sheetSelector) : overlay;
      const dismissBtn = overlay.querySelector("[data-sheet-dismiss]");
      if (!sheet || !dismissBtn) return;

      const pointerId = e.pointerId;
      const startY = e.clientY;
      let lastY = startY;
      let lastT = performance.now();
      let velocity = 0;
      // Don't claim the pointer (or touch anything visually) until real
      // movement is seen — a plain tap on the handle/topbar, including the
      // Cancel button itself, must still fire its native click undisturbed.
      let dragging = false;

      function onMove(ev) {
        if (ev.pointerId !== pointerId) return;
        const dy = ev.clientY - startY;
        if (!dragging) {
          if (Math.abs(dy) < 6) return;
          dragging = true;
          sheet.setPointerCapture(pointerId);
          overlay.classList.add("dragging");
        }
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) velocity = (ev.clientY - lastY) / dt;
        lastY = ev.clientY;
        lastT = now;
        sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
      }
      function onUp(ev) {
        if (ev.pointerId !== pointerId) return;
        cleanup();
        if (!dragging) return;
        const dy = Math.max(0, ev.clientY - startY);
        sheet.style.transform = "";
        if (dy > 90 || velocity > 0.6) dismissBtn.click();
      }
      function onCancel(ev) {
        if (ev.pointerId !== pointerId) return;
        cleanup();
        sheet.style.transform = "";
      }
      function cleanup() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        overlay.classList.remove("dragging");
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    }, { passive: true });
  }
  initSheetDrag(".confirm-overlay", ".confirm-card", ".confirm-card-handle");
  initSheetDrag(".picker-overlay", null, ".picker-handle, .picker-topbar");

  // ---------- Event delegation ----------
  appEl.addEventListener("click", onAppClick);
  appEl.addEventListener("input", onAppInput);
  appEl.addEventListener("change", onAppChange);
  appEl.addEventListener("pointerdown", onExerciseDragHandleDown);

  // ---------- Exercise long-press drag-to-reorder ----------
  // Press-and-hold the grip handle on an exercise header, then drag
  // vertically to reorder exercises within the active workout. Built on
  // pointer events (works for touch + mouse) with a long-press arm delay
  // so a normal tap/scroll on or near the handle never triggers a drag.
  const EX_DRAG_LONGPRESS_MS = 380;
  const EX_DRAG_CANCEL_PX = 10;
  let exDragArmTimer = null;
  let exDragArmStart = null;
  let exDragArmExIdx = null;
  let exDragCtx = null; // active drag: { exIdx, el, list, metrics, pointerId, pointerStartY, startScrollTop, currentIndex }

  function onExerciseDragHandleDown(e) {
    const handle = e.target.closest(".ex-drag-handle");
    if (!handle || !state.activeWorkout) return;
    e.preventDefault();
    exDragArmExIdx = parseInt(handle.dataset.exidx, 10);
    exDragArmStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    document.addEventListener("pointermove", onExDragArmMove);
    document.addEventListener("pointerup", onExDragArmCancel);
    document.addEventListener("pointercancel", onExDragArmCancel);
    exDragArmTimer = setTimeout(() => {
      const armed = exDragArmStart;
      const idx = exDragArmExIdx;
      clearExDragArm();
      beginExerciseDrag(idx, armed.pointerId, armed.y);
    }, EX_DRAG_LONGPRESS_MS);
  }

  function onExDragArmMove(e) {
    if (!exDragArmStart) return;
    const dx = e.clientX - exDragArmStart.x;
    const dy = e.clientY - exDragArmStart.y;
    if (Math.hypot(dx, dy) > EX_DRAG_CANCEL_PX) clearExDragArm();
  }

  function onExDragArmCancel() { clearExDragArm(); }

  function clearExDragArm() {
    clearTimeout(exDragArmTimer);
    exDragArmTimer = null;
    exDragArmStart = null;
    document.removeEventListener("pointermove", onExDragArmMove);
    document.removeEventListener("pointerup", onExDragArmCancel);
    document.removeEventListener("pointercancel", onExDragArmCancel);
  }

  function beginExerciseDrag(exIdx, pointerId, pointerStartY) {
    const list = document.getElementById("workout-exercises");
    if (!list) return;
    const blocks = Array.from(list.querySelectorAll(":scope > .exercise-block"));
    const el = blocks[exIdx];
    if (!el) return;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }

    // Collapse every card down to just its header while dragging (set
    // tables hidden, a "N sets" chip shown instead), so reordering a long
    // workout means shuffling compact rows instead of giant tables.
    const beforeTop = el.getBoundingClientRect().top;
    list.classList.add("ex-drag-collapse");
    // Keep the grabbed card's header under the finger: the cards above it
    // just shrank, so first restore its on-screen position via scroll,
    // then absorb whatever scroll couldn't cover (top-of-list clamp) into
    // a standing transform offset applied on top of the live drag delta.
    const afterTop = el.getBoundingClientRect().top;
    appEl.scrollTop += afterTop - beforeTop;
    const baseDy = beforeTop - el.getBoundingClientRect().top;

    const metrics = blocks.map((b) => ({ top: b.offsetTop, height: b.offsetHeight }));
    blocks.forEach((b) => { b.style.transition = "transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)"; });
    el.style.transition = "none";
    el.classList.add("ex-dragging");
    if (baseDy) el.style.transform = `translateY(${baseDy}px)`;
    exDragCtx = {
      exIdx,
      el,
      list,
      blocks,
      metrics,
      pointerId,
      pointerStartY,
      startScrollTop: appEl.scrollTop,
      currentIndex: exIdx,
      baseDy,
    };
    document.addEventListener("pointermove", onExerciseDragMove);
    document.addEventListener("pointerup", onExerciseDragEnd);
    document.addEventListener("pointercancel", onExerciseDragEnd);
  }

  function onExerciseDragMove(e) {
    const ctx = exDragCtx;
    if (!ctx || e.pointerId !== ctx.pointerId) return;
    e.preventDefault();
    const scrollDelta = appEl.scrollTop - ctx.startScrollTop;
    const dy = e.clientY - ctx.pointerStartY + scrollDelta + ctx.baseDy;
    ctx.el.style.transform = `translateY(${dy}px)`;

    // Auto-scroll the workout list when dragging near the top/bottom edge
    // of the visible viewport, so long exercise lists remain reachable.
    const edge = 70;
    if (e.clientY < edge) appEl.scrollTop -= 10;
    else if (e.clientY > window.innerHeight - edge) appEl.scrollTop += 10;

    const draggedMetric = ctx.metrics[ctx.exIdx];
    const draggedCenter = draggedMetric.top + draggedMetric.height / 2 + dy;

    let newIndex = ctx.exIdx;
    for (let i = 0; i < ctx.metrics.length; i++) {
      const m = ctx.metrics[i];
      if (draggedCenter > m.top + m.height / 2) newIndex = i;
    }
    newIndex = Math.max(0, Math.min(ctx.metrics.length - 1, newIndex));

    if (newIndex !== ctx.currentIndex) {
      ctx.currentIndex = newIndex;
      const draggedHeight = draggedMetric.height + 8; // include the collapsed block's margin-bottom
      ctx.blocks.forEach((b, i) => {
        if (i === ctx.exIdx) return;
        let shift = 0;
        if (i > ctx.exIdx && i <= newIndex) shift = -draggedHeight;
        else if (i < ctx.exIdx && i >= newIndex) shift = draggedHeight;
        b.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    }
  }

  function onExerciseDragEnd(e) {
    const ctx = exDragCtx;
    if (!ctx || (e.pointerId !== undefined && e.pointerId !== ctx.pointerId)) return;
    document.removeEventListener("pointermove", onExerciseDragMove);
    document.removeEventListener("pointerup", onExerciseDragEnd);
    document.removeEventListener("pointercancel", onExerciseDragEnd);

    ctx.blocks.forEach((b) => {
      b.style.transition = "";
      b.style.transform = "";
    });
    ctx.el.classList.remove("ex-dragging");
    ctx.list.classList.remove("ex-drag-collapse");

    const finalIndex = ctx.currentIndex;
    exDragCtx = null;

    if (finalIndex !== ctx.exIdx && state.activeWorkout) {
      const arr = state.activeWorkout.exercises;
      const [moved] = arr.splice(ctx.exIdx, 1);
      arr.splice(finalIndex, 0, moved);
      saveActiveWorkout();
      render();
      // Cards just re-expanded to full size — keep the moved exercise on screen.
      const nb = document.querySelectorAll("#workout-exercises > .exercise-block")[finalIndex];
      if (nb && nb.scrollIntoView) nb.scrollIntoView({ block: "nearest" });
    } else if (ctx.el.isConnected && ctx.el.scrollIntoView) {
      ctx.el.scrollIntoView({ block: "nearest" });
    }
  }

  function onAppClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    const { route } = parseHash();
    tapFeedback(t);

    switch (action) {
      case "back": history.back(); break;
      case "start-empty": startWorkout(null); break;
      case "resume-workout": navigate("workout-active"); break;
      case "open-routine": navigate("routine-edit", { id: t.dataset.id }); break;
      case "new-routine": navigate("routine-edit", { id: uid() }); break;
      case "start-routine": {
        const r = state.routines.find((x) => x.id === t.dataset.id);
        if (r) startWorkout(r);
        break;
      }
      case "view-workout": navigate("workout-detail", { id: t.dataset.id }); break;
      case "analytics-exercise":
        analyticsExerciseId = t.dataset.id;
        render();
        break;
      case "home-chart-metric":
        if (homeChartMetric !== t.dataset.metric) { homeChartMetric = t.dataset.metric; render(); }
        break;
      case "complete-done": navigate("home"); break;
      case "go-analytics": navigate("analytics"); break;
      case "ask-claude": copyClaudeExport(); break;
      case "delete-workout": deleteWorkout(t.dataset.id); break;
      case "view-exercise": navigate("exercise-detail", { id: t.dataset.id }); break;
      case "history-tab": navigate("history", { tab: t.dataset.tab }); break;
      case "cal-prev": calendarMonthOffset--; render(); break;
      case "cal-next": if (calendarMonthOffset < 0) { calendarMonthOffset++; render(); } break;
      case "new-exercise": handleNewExercise(); break;

      case "set-unit-mode":
        state.settings.unitMode = t.dataset.mode;
        if (t.dataset.mode !== "both") state.settings.activeUnit = t.dataset.mode;
        saveSettings(); render();
        break;
      case "set-active-unit":
        state.settings.activeUnit = t.dataset.unit;
        saveSettings(); render();
        break;
      case "set-haptics":
        state.settings.hapticsEnabled = t.dataset.value === "on";
        saveSettings(); render();
        break;
      case "set-rpe-visible":
        state.settings.showRpe = t.dataset.value === "on";
        saveSettings(); render();
        break;
      case "set-rest-enabled":
        state.settings.restTimerEnabled = t.dataset.value === "on";
        saveSettings(); render();
        break;
      case "set-rest-sec":
        state.settings.restTimerSec = parseInt(t.dataset.sec, 10) || 120;
        saveSettings(); render();
        break;
      case "toggle-plate": {
        const p = parseFloat(t.dataset.plate);
        const arr = state.settings.platesLb || (state.settings.platesLb = []);
        const i = arr.indexOf(p);
        if (i >= 0) arr.splice(i, 1); else arr.push(p);
        arr.sort((a, b) => b - a);
        saveSettings(); render();
        break;
      }
      case "export-csv": exportCsv(); break;
      case "export-data": exportData(); break;
      case "import-data": document.getElementById("import-file-input").click(); break;
      case "reset-data": resetData(); break;

      case "save-routine": saveRoutineDraft(); break;
      case "delete-routine": deleteRoutine(t.dataset.id); break;
      case "add-routine-exercise": addExerciseToRoutineDraft(); break;
      case "remove-routine-exercise":
        renderRoutineEdit._draft.exercises.splice(parseInt(t.dataset.index, 10), 1);
        render();
        break;
      case "routine-ex-menu":
        openExerciseMenu(parseInt(t.dataset.index, 10), "routine");
        break;
      case "add-routine-set": {
        const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
        re.sets.push({ weight: "", reps: "", isWarmup: false });
        render();
        break;
      }
      case "remove-routine-set": {
        const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
        re.sets.splice(parseInt(t.dataset.setidx, 10), 1);
        render();
        break;
      }

      case "discard-workout":
        showConfirm("Logged sets will be lost.", { title: "Discard this workout?", danger: true, okLabel: "Discard" })
          .then((ok) => { if (ok) discardWorkout(); });
        break;
      case "finish-workout": finishWorkout(); break;
      case "discard-cardio":
        showConfirm("This activity won't be saved.", { title: "Discard this activity?", danger: true, okLabel: "Discard" })
          .then((ok) => { if (ok) discardCardioActivity(); });
        break;
      case "finish-cardio": openRpeSheet(); break;
      case "resume-cardio": navigate("cardio-active"); break;
      case "view-activity": navigate("activity-detail", { id: t.dataset.id }); break;
      case "delete-activity":
        showConfirm("This can't be undone.", { title: "Delete this activity?", danger: true, okLabel: "Delete" })
          .then((ok) => { if (ok) deleteActivity(t.dataset.id); });
        break;
      case "go-settings": navigate("settings"); break;
      case "change-photo": document.getElementById("profile-photo-input").click(); break;
      case "go-calendar": navigate("history", { tab: "calendar" }); break;
      case "open-training-balance": openTrainingBalanceSheet(); break;
      case "info-training-load": openTrainingLoadSheet(); break;
      case "info-muscle-stim": openMuscleStimSheet(t.dataset.muscle); break;
      case "tonnage-bar-info": {
        const series = weeklyTonnageSeries();
        const s = series[parseInt(t.dataset.i, 10)];
        if (s) {
          const end = new Date(s.start + 6 * 86400000);
          showToast(`${Math.round(s.value).toLocaleString()} ${unitLabel()} · week of ${fmtDate(new Date(s.start).toISOString())}–${fmtDate(end.toISOString())}`);
        }
        break;
      }
      case "open-day": openDaySheet(t.dataset.date); break;
      case "add-workout-exercise": addExerciseToActiveWorkout(); break;
      case "remove-exercise":
        state.activeWorkout.exercises.splice(parseInt(t.dataset.exidx, 10), 1);
        saveActiveWorkout(); render();
        break;
      case "add-set": {
        const ex = state.activeWorkout.exercises[parseInt(t.dataset.exidx, 10)];
        ex.sets.push({ weight: "", reps: "", completed: false });
        saveActiveWorkout(); render();
        break;
      }
      case "remove-set": {
        const ex = state.activeWorkout.exercises[parseInt(t.dataset.exidx, 10)];
        ex.sets.splice(parseInt(t.dataset.setidx, 10), 1);
        saveActiveWorkout(); render();
        break;
      }
      case "workout-ex-menu":
        openExerciseMenu(parseInt(t.dataset.exidx, 10), "workout");
        break;
      case "toggle-set": {
        const exIdx = parseInt(t.dataset.exidx, 10), setIdx = parseInt(t.dataset.setidx, 10);
        const ex = state.activeWorkout.exercises[exIdx];
        const s = ex.sets[setIdx];
        s.completed = !s.completed;
        if (s.completed) {
          if (s.weight === "" ) s.weight = 0;
          if (s.reps === "") s.reps = 0;
          if (!s.isWarmup && state.settings.restTimerEnabled) startRestTimer();
        }
        saveActiveWorkout(); render();
        // One-shot completion pop on just the tapped check (re-query after
        // render, since render() rebuilt the DOM).
        if (s.completed) {
          const btn = document.querySelector(`.set-check[data-exidx="${exIdx}"][data-setidx="${setIdx}"]`);
          if (btn) { btn.classList.add("set-pop"); setTimeout(() => btn.classList.remove("set-pop"), 460); }
        }
        break;
      }
      case "set-type-menu":
        openSetTypeMenu(parseInt(t.dataset.exidx, 10), parseInt(t.dataset.setidx, 10));
        break;
      case "plate-calc": {
        const ex = state.activeWorkout.exercises[parseInt(t.dataset.exidx, 10)];
        const top = Math.max(0, ...ex.sets.filter((x) => !x.isWarmup).map((x) => x.weight || 0));
        openPlateCalc(top);
        break;
      }
      case "superset-toggle": {
        toggleSupersetWithNext(parseInt(t.dataset.exidx, 10));
        break;
      }
      case "add-warmup-ramp": {
        addWarmupRamp(parseInt(t.dataset.exidx, 10));
        break;
      }
    }
  }

  function onAppInput(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "set-weight" || action === "set-reps") {
      const exIdx = parseInt(t.dataset.exidx, 10), setIdx = parseInt(t.dataset.setidx, 10);
      const s = state.activeWorkout.exercises[exIdx].sets[setIdx];
      if (action === "set-weight") s.weight = weightFromDisplay(t.value);
      else s.reps = parseInt(t.value, 10) || 0;
      cascadeSetForward(exIdx, setIdx, s.weight, s.reps);
      saveActiveWorkout();
    } else if (action === "set-rpe") {
      const exIdx = parseInt(t.dataset.exidx, 10), setIdx = parseInt(t.dataset.setidx, 10);
      const s = state.activeWorkout.exercises[exIdx].sets[setIdx];
      const v = parseFloat(t.value);
      s.rpe = isNaN(v) ? null : Math.max(5, Math.min(10, v));
      saveActiveWorkout();
    } else if (action === "routine-set-weight" || action === "routine-set-reps") {
      const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
      const s = re.sets[parseInt(t.dataset.setidx, 10)];
      if (action === "routine-set-weight") s.weight = t.value === "" ? "" : weightFromDisplay(t.value);
      else s.reps = t.value === "" ? "" : (parseInt(t.value, 10) || 0);
    } else if (action === "set-height") {
      state.settings.heightIn = t.value === "" ? null : heightFromDisplay(t.value);
      saveSettings();
    } else if (action === "set-bar-weight") {
      const v = weightFromDisplay(t.value);
      if (v > 0) { state.settings.barWeightLb = v; saveSettings(); }
    }
  }

  function onAppChange(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    if (t.dataset.action === "import-file" && t.files && t.files[0]) {
      const file = t.files[0];
      t.value = ""; // reset so re-selecting the same file still fires change
      importData(file);
        } else if (t.dataset.action === "set-bodyweight") {
      // Log a dated bodyweight entry on commit (blur/enter), not per keystroke.
      if (t.value === "") return;
      const lb = weightFromDisplay(t.value);
      if (lb > 0) { logBodyWeight(lb); showToast("Body weight logged"); render(); }
    }
  }

  // Copies a set's weight/reps forward onto every later set in the same
  // exercise that hasn't been completed yet — most working sets use the
  // same weight, so this saves retyping it each time. Sets before the one
  // being edited, and any set already marked complete, are left alone.
  function cascadeSetForward(exIdx, fromSetIdx, weight, reps) {
    const ex = state.activeWorkout.exercises[exIdx];
    for (let i = fromSetIdx + 1; i < ex.sets.length; i++) {
      const later = ex.sets[i];
      if (later.completed) continue;
      later.weight = weight;
      later.reps = reps;
      const wInput = document.querySelector(`[data-action="set-weight"][data-exidx="${exIdx}"][data-setidx="${i}"]`);
      const rInput = document.querySelector(`[data-action="set-reps"][data-exidx="${exIdx}"][data-setidx="${i}"]`);
      if (wInput) wInput.value = weight === "" ? "" : weightToDisplay(weight);
      if (rInput) rInput.value = reps === "" ? "" : reps;
    }
  }

  function handleNewExercise() {
    openNewExerciseModal();
  }

  function addExerciseToRoutineDraft() {
    openExercisePicker("routine");
  }

  function addExerciseToActiveWorkout() {
    openExercisePicker("workout");
  }

  // ---------- Exercise picker ----------
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Other"];
  const EQUIPMENT_TYPES = ["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Other"];
  let pickerContext = null; // "routine" | "workout" | "replace"
  let pickerReplaceIndex = null; // exercise index being swapped, when context === "replace"
  let pickerViewMode = "list"; // "list" | "create"
  let newExerciseDraft = null;

  function openExercisePicker(context) {
    pickerContext = context;
    const overlay = document.getElementById("exercise-picker");
    overlay.classList.remove("hidden");
    document.getElementById("picker-search").value = "";
    showPickerListView();
    populatePickerFilters();
    renderPickerList();
    requestAnimationFrame(() => overlay.classList.add("open"));
  }

  // Opens the same picker in "replace" mode — selecting an exercise swaps
  // it in place (same position, same superset grouping, same set count)
  // instead of appending a new entry to the workout.
  function openReplaceExercisePicker(index) {
    pickerReplaceIndex = index;
    openExercisePicker("replace");
    document.getElementById("picker-title").textContent = "Replace exercise";
  }

  function closeExercisePicker() {
    const overlay = document.getElementById("exercise-picker");
    overlay.classList.remove("open");
    setTimeout(() => overlay.classList.add("hidden"), 220);
    pickerContext = null;
    pickerReplaceIndex = null;
    pickerViewMode = "list";
    newExerciseDraft = null;
  }

  function showPickerListView() {
    pickerViewMode = "list";
    newExerciseDraft = null;
    document.getElementById("picker-search-row").classList.remove("hidden");
    document.getElementById("picker-filter-row").classList.remove("hidden");
    document.getElementById("picker-create-row").classList.remove("hidden");
    document.getElementById("picker-body").classList.remove("hidden");
    document.getElementById("picker-create-body").classList.add("hidden");
    document.getElementById("picker-title").textContent = pickerContext === "replace" ? "Replace exercise" : "Add exercise";
    document.getElementById("picker-close").textContent = "Cancel";
  }

  function openCreateExercise() {
    pickerViewMode = "create";
    newExerciseDraft = { name: "", muscle: null, equipment: null };
    document.getElementById("picker-search-row").classList.add("hidden");
    document.getElementById("picker-filter-row").classList.add("hidden");
    document.getElementById("picker-create-row").classList.add("hidden");
    document.getElementById("picker-body").classList.add("hidden");
    document.getElementById("picker-create-body").classList.remove("hidden");
    document.getElementById("picker-title").textContent = "New exercise";
    document.getElementById("picker-close").textContent = "‹ Back";
    renderCreateExerciseForm();
  }

  // Shared markup for "name a new exercise, pick a muscle group, pick a
  // workout type" — used by both the in-workout picker's create flow and
  // the standalone New Exercise modal opened from the Exercises tab.
  function exerciseFormFieldsHtml(draft, opts) {
    const valid = draft.name.trim().length > 0 && !!draft.muscle && !!draft.equipment;
    return `
      <div class="create-ex-form">
        <label class="create-ex-label" for="${opts.nameInputId}">Exercise name</label>
        <input type="text" id="${opts.nameInputId}" class="create-ex-name-input" placeholder="e.g. Landmine press" value="${escapeHtml(draft.name)}" />

        <label class="create-ex-label">Muscle group</label>
        <div class="create-ex-chips">
          ${MUSCLE_GROUPS.map((m) => `<button class="chip ${draft.muscle === m ? "chip-selected" : ""}" data-action="${opts.muscleAction}" data-value="${m}">${m}</button>`).join("")}
        </div>

        <label class="create-ex-label">Workout type</label>
        <div class="create-ex-equip-grid">
          ${EQUIPMENT_TYPES.map((eq) => `
            <button class="equip-choice ${draft.equipment === eq ? "equip-choice-selected" : ""}" data-action="${opts.equipAction}" data-value="${eq}">
              <span class="equip-choice-icon">${equipmentIcon(eq)}</span>
              <span class="equip-choice-label">${eq}</span>
            </button>
          `).join("")}
        </div>

        <button class="btn btn-primary create-ex-save" data-action="${opts.saveAction}" ${valid ? "" : "disabled"}>${opts.saveLabel}</button>
      </div>
    `;
  }

  function renderCreateExerciseForm() {
    const body = document.getElementById("picker-create-body");
    body.innerHTML = exerciseFormFieldsHtml(newExerciseDraft, {
      nameInputId: "create-ex-name",
      muscleAction: "create-ex-set-muscle",
      equipAction: "create-ex-set-equipment",
      saveAction: "create-ex-save",
      saveLabel: "Add exercise",
    });
    const nameInput = document.getElementById("create-ex-name");
    nameInput.addEventListener("input", () => {
      newExerciseDraft.name = nameInput.value;
      const saveBtn = body.querySelector(".create-ex-save");
      const isValid = newExerciseDraft.name.trim().length > 0 && !!newExerciseDraft.muscle && !!newExerciseDraft.equipment;
      saveBtn.disabled = !isValid;
    });
  }

  function saveNewExercise() {
    const d = newExerciseDraft;
    if (!d) return;
    const name = d.name.trim();
    if (!name || !d.muscle || !d.equipment) return;
    const ex = { id: "custom-" + uid(), name, muscle: d.muscle, equipment: d.equipment, isCustom: true };
    state.customExercises.push(ex);
    DB.put("exercises", ex);
    confirmPickerSelection(ex.id);
    showToast(`${name} added`);
  }

  // ---------- Standalone "New exercise" modal (Exercises tab entry point) ----------
  let libraryExerciseDraft = null;

  function openNewExerciseModal() {
    libraryExerciseDraft = { name: "", muscle: null, equipment: null };
    const overlay = document.getElementById("new-exercise-modal");
    overlay.classList.remove("hidden");
    renderNewExerciseForm();
    requestAnimationFrame(() => overlay.classList.add("open"));
  }

  function closeNewExerciseModal() {
    const overlay = document.getElementById("new-exercise-modal");
    overlay.classList.remove("open");
    setTimeout(() => overlay.classList.add("hidden"), 220);
    libraryExerciseDraft = null;
  }

  function renderNewExerciseForm() {
    const body = document.getElementById("new-exercise-body");
    body.innerHTML = exerciseFormFieldsHtml(libraryExerciseDraft, {
      nameInputId: "new-ex-name",
      muscleAction: "new-ex-set-muscle",
      equipAction: "new-ex-set-equipment",
      saveAction: "new-ex-save",
      saveLabel: "Save exercise",
    });
    const nameInput = document.getElementById("new-ex-name");
    nameInput.addEventListener("input", () => {
      libraryExerciseDraft.name = nameInput.value;
      const saveBtn = body.querySelector(".create-ex-save");
      const isValid = libraryExerciseDraft.name.trim().length > 0 && !!libraryExerciseDraft.muscle && !!libraryExerciseDraft.equipment;
      saveBtn.disabled = !isValid;
    });
  }

  function saveLibraryExercise() {
    const d = libraryExerciseDraft;
    if (!d) return;
    const name = d.name.trim();
    if (!name || !d.muscle || !d.equipment) return;
    const ex = { id: "custom-" + uid(), name, muscle: d.muscle, equipment: d.equipment, isCustom: true };
    state.customExercises.push(ex);
    DB.put("exercises", ex);
    closeNewExerciseModal();
    showToast(`${name} added to your exercises`);
    navigate("exercise-detail", { id: ex.id });
  }

  document.getElementById("new-exercise-cancel").addEventListener("click", () => { tapFeedback(null); closeNewExerciseModal(); });
  document.getElementById("new-exercise-body").addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    tapFeedback(t);
    if (t.dataset.action === "new-ex-set-muscle") {
      libraryExerciseDraft.muscle = t.dataset.value;
      renderNewExerciseForm();
    } else if (t.dataset.action === "new-ex-set-equipment") {
      libraryExerciseDraft.equipment = t.dataset.value;
      renderNewExerciseForm();
    } else if (t.dataset.action === "new-ex-save") {
      saveLibraryExercise();
    }
  });

  function populatePickerFilters() {
    const muscles = [...new Set(allExercises().map((e) => e.muscle))].sort();
    const equipment = [...new Set(allExercises().map((e) => e.equipment))].sort();
    const mSel = document.getElementById("picker-filter-muscle");
    const eSel = document.getElementById("picker-filter-equipment");
    mSel.innerHTML = `<option value="any">Any body part</option>` + muscles.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    eSel.innerHTML = `<option value="any">Any category</option>` + equipment.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  }

  function lastPerformedSummary(exerciseId) {
    for (const w of state.workouts) {
      const ex = w.exercises.find((x) => x.exerciseId === exerciseId);
      if (ex) {
        const completed = ex.sets.filter((s) => s.completed && !s.isWarmup);
        if (completed.length) {
          const best = completed.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
          return `${weightToDisplay(best.weight)} ${unitLabel()} × ${best.reps}`;
        }
      }
    }
    return null;
  }

  function equipmentIcon(equipment) {
    const files = {
      Barbell: "barbell_icon.png",
      Dumbbell: "dumbbell_icon.png",
      Cable: "cable_icon.png",
      Machine: "machine_icon.png",
      Bodyweight: "bodyweight_icon.png",
    };
    const file = files[equipment];
    if (file) {
      return `<img src="icons/equipment/${file}" alt="${escapeHtml(equipment)}" class="equip-icon-img" />`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="6.3" y1="6.3" x2="17.7" y2="17.7"/><line x1="17.7" y1="6.3" x2="6.3" y2="17.7"/></svg>`;
  }

  function pickerRowHtml(ex) {
    const summary = lastPerformedSummary(ex.id);
    return `
      <button class="picker-row" data-action="picker-select" data-id="${ex.id}">
        <span class="picker-thumb">${equipmentIcon(ex.equipment)}</span>
        <span class="picker-row-text">
          <span class="picker-row-name">${escapeHtml(ex.name)}</span>
          <span class="picker-row-sub">${escapeHtml(ex.muscle)}</span>
        </span>
        ${summary ? `<span class="picker-row-last">${summary}</span>` : ""}
      </button>`;
  }

  function renderPickerList() {
    const search = (document.getElementById("picker-search").value || "").toLowerCase();
    const muscleFilter = document.getElementById("picker-filter-muscle").value || "any";
    const equipFilter = document.getElementById("picker-filter-equipment").value || "any";

    let list = allExercises().filter((e) => {
      if (search && !e.name.toLowerCase().includes(search) && !e.muscle.toLowerCase().includes(search)) return false;
      if (muscleFilter !== "any" && e.muscle !== muscleFilter) return false;
      if (equipFilter !== "any" && e.equipment !== equipFilter) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const groups = {};
    list.forEach((e) => {
      const L = /[A-Za-z]/.test(e.name[0]) ? e.name[0].toUpperCase() : "#";
      (groups[L] = groups[L] || []).push(e);
    });
    const letters = Object.keys(groups).sort();

    const listEl = document.getElementById("picker-list");
    listEl.innerHTML = letters.length
      ? letters.map((L) => `
        <div class="picker-letter-heading" id="picker-letter-${L}">${L}</div>
        ${groups[L].map((e) => pickerRowHtml(e)).join("")}
      `).join("")
      : emptyStateHtml("No matches", "Try a different search or filter.", "search");

    const idxEl = document.getElementById("picker-index");
    idxEl.innerHTML = ALPHABET.map((L) =>
      `<button class="picker-index-letter" data-letter="${L}" ${letters.includes(L) ? "" : "disabled"}>${L}</button>`
    ).join("");
  }

  function confirmPickerSelection(exerciseId) {
    const ex = exerciseById(exerciseId);
    if (!ex) return;
    if (pickerContext === "routine") {
      renderRoutineEdit._draft.exercises.push({
        exerciseId: ex.id,
        note: "",
        sets: [
          { weight: "", reps: "", isWarmup: false },
          { weight: "", reps: "", isWarmup: false },
          { weight: "", reps: "", isWarmup: false },
        ],
      });
      closeExercisePicker();
      render();
    } else if (pickerContext === "workout") {
      state.activeWorkout.exercises.push({
        exerciseId: ex.id,
        name: ex.name,
        note: "",
        sets: defaultSetsForExercise(ex.id),
      });
      saveActiveWorkout();
      closeExercisePicker();
      render();
    } else if (pickerContext === "replace") {
      const target = state.activeWorkout && state.activeWorkout.exercises[pickerReplaceIndex];
      if (target) {
        const oldName = target.name;
        const setCount = target.sets.length;
        // Mutate in place (not a new array entry) so position and any
        // superset grouping (supersetId) carry over untouched. The note
        // is cleared since it's almost always specific to the old lift
        // (rep ranges, RPE targets, "-10% of comp bench", etc.).
        target.exerciseId = ex.id;
        target.name = ex.name;
        target.note = "";
        target.sets = defaultSetsForExercise(ex.id, setCount);
        saveActiveWorkout();
        showToast(`Swapped ${oldName} for ${ex.name}`);
      }
      closeExercisePicker();
      render();
    } else {
      closeExercisePicker();
    }
  }

  document.getElementById("picker-close").addEventListener("click", () => {
    tapFeedback(null);
    if (pickerViewMode === "create") showPickerListView();
    else closeExercisePicker();
  });
  document.getElementById("picker-search").addEventListener("input", renderPickerList);
  document.getElementById("picker-filter-muscle").addEventListener("change", renderPickerList);
  document.getElementById("picker-filter-equipment").addEventListener("change", renderPickerList);
  document.getElementById("picker-list").addEventListener("click", (e) => {
    const row = e.target.closest('[data-action="picker-select"]');
    if (!row) return;
    tapFeedback(row);
    confirmPickerSelection(row.dataset.id);
  });
  document.getElementById("picker-index").addEventListener("click", (e) => {
    const btn = e.target.closest(".picker-index-letter");
    if (!btn || btn.disabled) return;
    const target = document.getElementById("picker-letter-" + btn.dataset.letter);
    if (target) target.scrollIntoView({ block: "start" });
  });
  document.getElementById("picker-create-row").addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="open-create-exercise"]');
    if (!btn) return;
    tapFeedback(btn, "primary");
    openCreateExercise();
  });
  document.getElementById("picker-create-body").addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    tapFeedback(t);
    const action = t.dataset.action;
    if (action === "create-ex-set-muscle") {
      newExerciseDraft.muscle = t.dataset.value;
      renderCreateExerciseForm();
    } else if (action === "create-ex-set-equipment") {
      newExerciseDraft.equipment = t.dataset.value;
      renderCreateExerciseForm();
    } else if (action === "create-ex-save") {
      saveNewExercise();
    }
  });

  async function saveRoutineDraft() {
    const draft = renderRoutineEdit._draft;
    if (draft.exercises.length === 0) { showToast("Add at least one exercise"); return; }
    await DB.put("routines", draft);
    const idx = state.routines.findIndex((r) => r.id === draft.id);
    if (idx >= 0) state.routines[idx] = draft; else state.routines.push(draft);
    showToast("Routine saved");
    navigate("home");
  }

  async function deleteRoutine(id) {
    if (!(await showConfirm("This can't be undone.", { title: "Delete this routine?", danger: true, okLabel: "Delete" }))) return;
    await DB.delete("routines", id);
    state.routines = state.routines.filter((r) => r.id !== id);
    navigate("home");
  }

  async function deleteWorkout(id) {
    if (!(await showConfirm("This can't be undone.", { title: "Delete this workout?", danger: true, okLabel: "Delete" }))) return;
    await DB.delete("workouts", id);
    state.workouts = state.workouts.filter((w) => w.id !== id);
    showToast("Workout deleted");
    const { route, params } = parseHash();
    if (route === "workout-detail" && params.id === id) {
      navigate("history", { tab: "workouts" });
    } else {
      render();
    }
  }

  async function exportData() {
    const data = { settings: state.settings, customExercises: state.customExercises, routines: state.routines, workouts: state.workouts, activities: state.activities };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `just-lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // One row per completed set — the spreadsheet-friendly flat format lifters
  // use for their own analysis. Weights are exported in the current display
  // unit so the numbers match what's shown in the app.
  function exportCsv() {
    const u = unitLabel();
    const esc = (v) => {
      const str = String(v == null ? "" : v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [["date", "workout", "exercise", "muscle", "set_type", `weight_${u}`, "reps", "rpe", "est_1rm"]];
    const ordered = [...state.workouts].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const w of ordered) {
      const dateStr = new Date(w.date).toISOString().slice(0, 10);
      for (const e of w.exercises) {
        const ex = exerciseById(e.exerciseId);
        for (const s of e.sets) {
          const type = s.isWarmup ? "warmup" : (s.type || "working");
          rows.push([
            dateStr, w.name, ex ? ex.name : e.name, ex ? ex.muscle : "",
            type, roundClean(weightToDisplay(s.weight) || 0), s.reps || 0,
            s.rpe == null ? "" : s.rpe,
            roundClean(displayUnit() === "kg" ? lbToKg(estOneRm(s.weight || 0, s.reps || 0)) : estOneRm(s.weight || 0, s.reps || 0)),
          ]);
        }
      }
    }
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `just-lift-sets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch (err) {
      showToast("That file isn't a valid backup.");
      return;
    }
    const looksValid = data && typeof data === "object" &&
      (Array.isArray(data.workouts) || Array.isArray(data.routines) || Array.isArray(data.customExercises) || (data.settings && typeof data.settings === "object"));
    if (!looksValid) {
      showToast("That file isn't a valid Just Lift backup.");
      return;
    }
    if (!(await showConfirm("This replaces all current routines, workouts, activities, and custom exercises with the contents of this backup file. This can't be undone.", { title: "Restore backup?", danger: true, okLabel: "Restore" }))) return;

    await Promise.all([DB.clear("exercises"), DB.clear("routines"), DB.clear("workouts"), DB.clear("activities")]);

    const customExercises = Array.isArray(data.customExercises) ? data.customExercises : [];
    const routines = Array.isArray(data.routines) ? data.routines : [];
    const workouts = Array.isArray(data.workouts) ? data.workouts : [];
    const activities = Array.isArray(data.activities) ? data.activities : [];

    await Promise.all([
      ...customExercises.map((ex) => DB.put("exercises", ex)),
      ...routines.map((r) => DB.put("routines", r)),
      ...workouts.map((w) => DB.put("workouts", w)),
      ...activities.map((a) => DB.put("activities", a)),
    ]);

    if (data.settings && typeof data.settings === "object") {
      state.settings = { ...state.settings, ...data.settings };
      saveSettings();
    }

    state.customExercises = customExercises;
    state.routines = routines;
    state.workouts = workouts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activities = activities.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    await backfillEffortScores();

    showToast("Backup restored.");
    navigate("home");
  }

  async function resetData() {
    if (!(await showConfirm("This deletes all routines, workouts, activities, and custom exercises.", { title: "Erase all data?", danger: true, okLabel: "Erase" }))) return;
    await Promise.all([DB.clear("exercises"), DB.clear("routines"), DB.clear("workouts"), DB.clear("activities")]);
    await DB.kvSet("activeWorkout", null);
    await DB.kvSet("activeCardio", null);
    await DB.kvSet("profilePhoto", null);
    state.customExercises = [];
    state.routines = [];
    state.workouts = [];
    state.activities = [];
    state.activeWorkout = null;
    state.activeCardio = null;
    state.profilePhoto = null;
    updateProfileBtnAvatar();
    navigate("home");
  }

  // ---------- Set-type menu (tap a set number) ----------
  let setTypeTarget = null;
  const setTypeOverlayEl = document.getElementById("set-type-overlay");

  function openSetTypeMenu(exIdx, setIdx) {
    setTypeTarget = { exIdx, setIdx };
    setTypeOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => setTypeOverlayEl.classList.add("open"));
  }
  function closeSetTypeMenu() {
    setTypeOverlayEl.classList.remove("open");
    setTimeout(() => setTypeOverlayEl.classList.add("hidden"), 180);
    setTypeTarget = null;
  }
  document.getElementById("set-type-close").addEventListener("click", () => { tapFeedback(null); closeSetTypeMenu(); });
  document.getElementById("set-type-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-type]");
    if (!btn || !setTypeTarget) return;
    tapFeedback(btn);
    const { exIdx, setIdx } = setTypeTarget;
    const ex = state.activeWorkout.exercises[exIdx];
    const s = ex.sets[setIdx];
    const type = btn.dataset.type;
    if (type === "remove") ex.sets.splice(setIdx, 1);
    else if (type === "normal") { s.isWarmup = false; delete s.type; }
    else if (type === "warmup") { s.isWarmup = true; delete s.type; }
    else { s.isWarmup = false; s.type = type; } // drop | failure
    saveActiveWorkout();
    closeSetTypeMenu();
    render();
  });

  // ---------- Supersets & warm-up ramp ----------
  function toggleSupersetWithNext(exIdx) {
    const ex = state.activeWorkout.exercises;
    if (exIdx >= ex.length - 1) { showToast("No exercise below to superset with"); return; }
    const a = ex[exIdx], b = ex[exIdx + 1];
    if (a.supersetId && a.supersetId === b.supersetId) {
      a.supersetId = null; // break the link below this exercise
    } else {
      const id = b.supersetId || a.supersetId || ("ss-" + uid());
      a.supersetId = id; b.supersetId = id;
    }
    // Clear any supersetId that no longer has a contiguous partner.
    ex.forEach((e, i) => {
      const prev = ex[i - 1], next = ex[i + 1];
      if (e.supersetId && !(prev && prev.supersetId === e.supersetId) && !(next && next.supersetId === e.supersetId)) {
        e.supersetId = null;
      }
    });
    saveActiveWorkout();
    render();
  }

  function addWarmupRamp(exIdx) {
    const ex = state.activeWorkout.exercises[exIdx];
    const top = Math.max(0, ...ex.sets.filter((s) => !s.isWarmup).map((s) => s.weight || 0));
    if (!(top > 0)) { showToast("Enter a working weight first"); return; }
    const ramp = warmupRamp(top);
    if (!ramp.length) { showToast("Weight too light for a ramp"); return; }
    ex.sets = [...ramp, ...ex.sets];
    saveActiveWorkout();
    render();
    showToast(`Added ${ramp.length} warm-up sets`);
  }

  // ---------- Plate calculator ----------
  let plateWeightLb = 0;
  const plateOverlayEl = document.getElementById("plate-overlay");

  function openPlateCalc(totalLb) {
    plateWeightLb = totalLb || state.settings.barWeightLb || 45;
    document.getElementById("plate-unit").textContent = unitLabel();
    document.getElementById("plate-weight-input").value = weightToDisplay(plateWeightLb);
    renderPlateVisual();
    plateOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => plateOverlayEl.classList.add("open"));
  }
  function closePlateCalc() {
    plateOverlayEl.classList.remove("open");
    setTimeout(() => plateOverlayEl.classList.add("hidden"), 180);
  }
  function plateHeight(p) { return Math.max(26, Math.min(66, 26 + p * 0.85)); }
  function renderPlateVisual() {
    const bar = state.settings.barWeightLb || 45;
    const vis = document.getElementById("plate-visual");
    const read = document.getElementById("plate-readout");
    if (plateWeightLb < bar) {
      vis.innerHTML = "";
      read.innerHTML = `<span class="muted">Below the bar (${weightToDisplay(bar)} ${unitLabel()})</span>`;
      return;
    }
    const { perSide, leftover, achievable } = computePlates(plateWeightLb);
    vis.innerHTML = `<div class="plate-bar-graphic"><span class="plate-collar"></span>${
      perSide.length
        ? perSide.map((p) => `<span class="plate-disc" style="height:${plateHeight(p)}px">${weightToDisplay(p)}</span>`).join("")
        : '<span class="muted" style="align-self:center;">empty bar</span>'
    }<span class="plate-sleeve"></span></div>`;
    const counts = {};
    perSide.forEach((p) => (counts[p] = (counts[p] || 0) + 1));
    const summary = Object.entries(counts).sort((a, b) => b[0] - a[0]).map(([p, n]) => `${n}×${weightToDisplay(parseFloat(p))}`).join("  +  ");
    read.innerHTML = `<div class="plate-readout-line"><strong>Each side:</strong> ${summary || "—"}</div>` +
      (achievable ? "" : `<div class="plate-warn">Closest loadable — ${weightToDisplay(leftover)} ${unitLabel()} short per side</div>`);
  }
  document.getElementById("plate-close").addEventListener("click", () => { tapFeedback(null); closePlateCalc(); });
  document.getElementById("plate-weight-input").addEventListener("input", (e) => {
    plateWeightLb = weightFromDisplay(e.target.value);
    renderPlateVisual();
  });

  // ---------- Rest timer ----------
  let restInterval = null, restEndAt = null, restTotal = 0;
  function startRestTimer() {
    restTotal = state.settings.restTimerSec || 120;
    restEndAt = Date.now() + restTotal * 1000;
    document.getElementById("rest-timer-bar").classList.remove("hidden");
    tickRest();
    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(tickRest, 250);
  }
  function tickRest() {
    if (restEndAt == null) return;
    const remain = Math.max(0, (restEndAt - Date.now()) / 1000);
    const countEl = document.getElementById("rest-timer-count");
    if (countEl) countEl.textContent = fmtTime(remain);
    const fill = document.getElementById("rest-timer-fill");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, 100 * remain / restTotal))}%`;
    if (remain <= 0) endRestTimer(true);
  }
  function adjustRest(deltaSec) {
    if (restEndAt == null) return;
    restEndAt += deltaSec * 1000;
    restTotal = Math.max(restTotal, (restEndAt - Date.now()) / 1000);
    tickRest();
  }
  function endRestTimer(completed) {
    if (restInterval) { clearInterval(restInterval); restInterval = null; }
    restEndAt = null;
    const bar = document.getElementById("rest-timer-bar");
    if (bar) bar.classList.add("hidden");
    if (completed) {
      try { playTone(880, 660, 0.05, 0.22, "sine"); } catch (e) {}
      if (navigator.vibrate && state.settings.hapticsEnabled !== false) navigator.vibrate(180);
    }
  }
  document.getElementById("rest-minus").addEventListener("click", () => { tapFeedback(null); adjustRest(-15); });
  document.getElementById("rest-plus").addEventListener("click", () => { tapFeedback(null); adjustRest(15); });
  document.getElementById("rest-skip").addEventListener("click", () => { tapFeedback(null); endRestTimer(false); });

  // ---------- Init ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => { tapFeedback(tab, "toggle"); navigate(tab.dataset.route); });
  });

  (async function init() {
    await loadAll();
    updateProfileBtnAvatar();
    if (!location.hash) location.hash = "#home";
    render();
    if ("serviceWorker" in navigator) {
      // updateViaCache: "none" stops the browser from ever serving sw.js
      // itself out of HTTP cache when checking for a new version, so a new
      // deploy is picked up the moment the app is reopened rather than
      // waiting out GitHub Pages' cache-control window.
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
    }
    // Ask the browser not to auto-evict this site's storage under disk
    // pressure. Best-effort only — unsupported or denied silently no-ops.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  })();
})();
