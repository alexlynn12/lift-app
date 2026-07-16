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
    const [settings, customExercises, routines, workouts, activeWorkout] = await Promise.all([
      DB.kvGet("settings", null),
      DB.getAll("exercises"),
      DB.getAll("routines"),
      DB.getAll("workouts"),
      DB.kvGet("activeWorkout", null),
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
    await seedProgram();
    state.workouts = (workouts || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activeWorkout = activeWorkout;

    await backfillEffortScores();

  }

  // Seeds (or upgrades) the pre-loaded training program. A fresh install gets
  // the routines from program-seed.js. When PROGRAM_SEED_VERSION is bumped —
  // meaning the program itself changed (e.g. v3 -> v3.1) — existing installs
  // get their old seed-* routines swapped for the new ones. User-created
  // routines and all workout history/PRs are never touched. An install that
  // deliberately deleted the seeded program doesn't get it re-added.
  async function seedProgram() {
    if (typeof PROGRAM_SEED === "undefined" || !PROGRAM_SEED.length) return;
    const version = typeof PROGRAM_SEED_VERSION === "undefined" ? 1 : PROGRAM_SEED_VERSION;
    let seededVersion = await DB.kvGet("programSeedVersion", null);
    if (seededVersion == null) {
      // Pre-versioning installs only carried a boolean "programSeeded" flag.
      seededVersion = (await DB.kvGet("programSeeded", false)) ? 1 : 0;
    }
    if (seededVersion >= version) return;
    const hasOldSeed = state.routines.some((r) => String(r.id).startsWith("seed-"));
    if (seededVersion > 0 && !hasOldSeed) {
      // Was seeded before but the person deleted the program — respect that.
      await DB.kvSet("programSeedVersion", version);
      return;
    }
    if (seededVersion === 0 && state.routines.length > 0 && !hasOldSeed) {
      // Never seeded, but they already built their own routines — don't intrude.
      await DB.kvSet("programSeedVersion", version);
      return;
    }
    const seeded = PROGRAM_SEED.map((r) => ({
      id: r.id,
      name: r.name,
      exercises: r.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        note: e.note || "",
        sets: e.sets.map((s) => ({
          weight: s.weight === "" || s.weight == null ? "" : s.weight,
          reps: s.reps === "" || s.reps == null ? "" : s.reps,
          isWarmup: !!s.isWarmup,
        })),
      })),
    }));
    // Drop every old seeded routine (including ones whose ids aren't reused),
    // then write the new program in.
    const oldSeeds = state.routines.filter((r) => String(r.id).startsWith("seed-"));
    await Promise.all(oldSeeds.map((r) => DB.delete("routines", r.id)));
    state.routines = state.routines.filter((r) => !String(r.id).startsWith("seed-"));
    await Promise.all(seeded.map((r) => DB.put("routines", r)));
    state.routines = [...seeded, ...state.routines];
    await DB.kvSet("programSeedVersion", version);
    await DB.kvSet("programSeeded", true);
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

  // ===== Training calendar / streak / frequency =====
  // Set of YYYY-MM-DD strings on which at least one workout was logged.
  function workoutDaySet() {
    const set = new Set();
    for (const w of state.workouts) set.add(new Date(w.date).toISOString().slice(0, 10));
    return set;
  }

  // Current streak = consecutive weeks (Mon–Sun) with ≥1 workout, counting
  // back from this week. This week doesn't break the streak until it ends.
  function weekStreak() {
    if (state.workouts.length === 0) return 0;
    const weekKey = (d) => {
      const dt = new Date(d);
      const day = (dt.getDay() + 6) % 7; // Mon=0
      dt.setDate(dt.getDate() - day); dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    };
    const weeks = new Set(state.workouts.map((w) => weekKey(w.date)));
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
    return state.workouts.filter((w) => new Date(w.date) >= monday).length;
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

  // Difficulty is a heuristic (equipment x muscle-mass x movement pattern),
  // not a manual lookup table, so it applies automatically to custom
  // exercises too. It's intentionally approximate — the goal is "mostly
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

  function exerciseDifficulty(ex) {
    if (!ex) return 1.0;
    const muscle = MUSCLE_DIFFICULTY[ex.muscle] ?? 1.0;
    const equipment = EQUIPMENT_DIFFICULTY[ex.equipment] ?? 1.0;
    const movement = movementFactor(ex.name);
    return Math.max(0.65, Math.min(1.65, muscle * equipment * movement));
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
    const tier = movementTier(ex ? ex.name : "");
    const sensitivity = tier === "veryHigh" ? 1 : tier === "high" ? 0.7 : 0;
    if (sensitivity === 0) return 1.0;
    const raw = 1 + (heightIn - HEIGHT_REFERENCE_IN) * HEIGHT_ROM_PER_INCH * sensitivity;
    return Math.max(0.85, Math.min(1.15, raw));
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
  const EFFORT_WEIGHTS = { intensity: 0.40, muscle: 0.35, volume: 0.25 };
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
  function setEffortMetrics(set, ex, bestE1rm) {
    if (!set || !set.completed || set.isWarmup) return null;
    const reps = set.reps || 0;
    if (reps <= 0) return null;
    const load = effectiveLoad(set, ex);
    const diff = exerciseDifficulty(ex) * heightRomFactor(ex, state.settings.heightIn);
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
  function workoutEffortMetrics(exercises, bestFor) {
    const totals = { topRpe: 0, muscle: 0, volume: 0 };
    for (const e of exercises) {
      const ex = exerciseById(e.exerciseId);
      if (!ex) continue;
      const best = bestFor(e.exerciseId);
      for (const s of e.sets) {
        const m = setEffortMetrics(s, ex, best);
        if (!m) continue;
        // Intensity is a peak (hardest single set of the session);
        // muscle and volume accumulate.
        totals.topRpe = Math.max(totals.topRpe, m.rpe);
        totals.muscle += m.muscle;
        totals.volume += m.volume;
      }
    }
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
    const breakdown = {
      intensity: Math.round(intensityScore),
      muscle: Math.round(muscleScore),
      volume: Math.round(volumeScore),
    };
    const blended =
      EFFORT_WEIGHTS.intensity * (intensityScore / 100) +
      EFFORT_WEIGHTS.muscle * (muscleScore / 100) +
      EFFORT_WEIGHTS.volume * (volumeScore / 100);
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
  const EFFORT_SCORE_VERSION = 5;

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
        const metrics = workoutEffortMetrics(w.exercises, (id) => bestE1rmSoFar[id] || 0);
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
    const effortMetrics = workoutEffortMetrics(cleanExercises, (id) => bestE1rmAllTime(id));
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

  // ---------- Render ----------
  let lastRenderedHash = null;

  function render() {
    const { route, params } = parseHash();
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.route === route));
    document.getElementById("tabbar").style.display = ["home", "history", "exercises", "settings"].includes(route) ? "flex" : "none";

    switch (route) {
      case "home": renderHome(); break;
      case "history": renderHistory(params); break;
      case "exercises": renderExercises(params); break;
      case "settings": renderSettings(); break;
      case "routine-edit": renderRoutineEdit(params); break;
      case "workout-active": renderWorkoutActive(); break;
      case "workout-detail": renderWorkoutDetail(params); break;
      case "workout-complete": renderWorkoutComplete(params); break;
      case "exercise-detail": renderExerciseDetail(params); break;
      default: renderHome(); break;
    }

    // Only animate + scroll-to-top on an actual navigation (the hash
    // changed) — not on in-place re-renders triggered by things like
    // toggling a set checkbox, which call render() without touching the
    // hash and would otherwise flash/jump distractingly on every tap.
    if (location.hash !== lastRenderedHash) {
      appEl.scrollTop = 0;
      appEl.classList.remove("app-enter");
      void appEl.offsetWidth;
      appEl.classList.add("app-enter");
    }
    lastRenderedHash = location.hash;
  }

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

  function renderHome() {
    const last = state.workouts[0];
    appEl.innerHTML = `
      <div class="topbar"><h1>Home</h1></div>

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

      <button class="btn btn-primary" data-action="start-empty" style="margin-bottom:16px;">+ Start empty workout</button>

      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">Routines</h3>
        </div>
        ${state.routines.length === 0 ? emptyStateHtml("No routines yet", "Create one to pre-load your sets each session.", "routines") : ""}
        ${state.routines.map((r) => {
          const lastEffort = lastEffortForRoutine(r.id);
          return `
          <div class="card card-tap" data-action="open-routine" data-id="${r.id}">
            <div class="row">
              <div>
                <div style="font-weight:700;">${escapeHtml(r.name)}</div>
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
      if (state.workouts.length === 0) {
        body.innerHTML = emptyStateHtml("No workouts logged", "Finish a workout and it'll show up here.", "workouts");
        return;
      }
      body.innerHTML = state.workouts.map((w) => `
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
        </div>
      `).join("");
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
            <div class="row-title">${escapeHtml(ex.name)}</div>
            <div class="tiny muted">${ex.muscle}</div>
          </div>
          <span class="muted">›</span>
        </div>
      `).join("");
    }
  }

  // Which month the History calendar shows: 0 = current, negative = past.
  let calendarMonthOffset = 0;

  function renderCalendarInto(body) {
    const days = workoutDaySet();
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
      cells += `<div class="cal-cell ${has ? "cal-active" : ""} ${ds === todayStr ? "cal-today" : ""}"><span>${d}</span></div>`;
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

  function renderExercises(params) {
    const q = (params.q || "").toLowerCase();
    const list = allExercises()
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    appEl.innerHTML = `
      <div class="topbar"><h1>Exercises</h1></div>
      <input type="text" id="ex-search" placeholder="Search exercises" value="${escapeHtml(params.q || "")}" style="margin-bottom:16px;" />
      <div>
        ${list.map((ex) => `
          <div class="list-row card-tap" data-action="view-exercise" data-id="${ex.id}">
            <div>
              <div class="row-title">${escapeHtml(ex.name)}</div>
              <div class="tiny muted">${ex.muscle} · ${ex.equipment}</div>
            </div>
            <span class="muted">›</span>
          </div>
        `).join("")}
      </div>
      <button class="fab-add" data-action="new-exercise" style="margin-top:16px;">+ Add custom exercise</button>
    `;
    const search = document.getElementById("ex-search");
    search.addEventListener("input", () => {
      const params2 = { q: search.value };
      const qs = "?" + new URLSearchParams(params2).toString();
      history.replaceState(null, "", "#exercises" + qs);
    });
    search.addEventListener("change", () => render());
    search.focus();
    search.selectionStart = search.value.length;
  }

  function renderExerciseDetail(params) {
    const ex = exerciseById(params.id);
    if (!ex) { navigate("exercises"); return; }
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

  function renderSettings() {
    const s = state.settings;
    const bwData = (s.bodyWeightLog || []).slice(-12).map((e) => ({ date: e.date, value: displayUnit() === "kg" ? lbToKg(e.lb) : e.lb }));
    appEl.innerHTML = `
      <div class="topbar"><h1>Settings</h1></div>

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
          <div class="tiny muted" style="margin-top:8px; margin-bottom:${bwData.length >= 2 ? "12px" : "12px"};">Updating this logs a dated entry so you can track your weight over time. Also scores bodyweight exercises (push-ups, pull-ups, planks). Without it we assume ${DEFAULT_BODYWEIGHT_LB} lb.</div>
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
          <div class="tiny muted" style="margin-top:8px;">Used to fairly adjust effort scoring for range of motion on lifts like squats, deadlifts, and presses — taller lifters move the weight farther per rep. Isolation exercises aren't affected. Leaving this blank skips the adjustment entirely.</div>
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
                <button class="icon-btn icon-btn-danger" data-action="remove-routine-exercise" data-index="${i}">Remove</button>
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
            ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ""}
            ${sugg && sugg.bumped ? `<div class="ex-suggest">▲ Suggested: ${weightToDisplay(sugg.next)} ${u} <span class="muted">(last ${weightToDisplay(sugg.last)}×${sugg.reps})</span></div>` : ""}
          </div>
          <div class="ex-header-actions">
            ${isBarbell && topWeight > 0 ? `<button class="ex-plate-btn" data-action="plate-calc" data-exidx="${exIdx}" aria-label="Plate calculator">${ICONS.barbell}</button>` : ""}
            <button class="ex-menu-btn" data-action="workout-ex-menu" data-exidx="${exIdx}" aria-label="Exercise options">${ICONS.kebab}</button>
            <button class="icon-btn icon-btn-danger" data-action="remove-exercise" data-exidx="${exIdx}">Remove</button>
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
              <td><input class="set-input" inputmode="decimal" type="number" step="0.5" data-action="set-weight" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.weight === "" ? "" : weightToDisplay(s.weight)}" placeholder="0" /></td>
              <td><input class="set-input" inputmode="numeric" type="number" step="1" data-action="set-reps" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.reps === "" ? "" : s.reps}" placeholder="0" /></td>
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
        return `
        <div class="exercise-block">
          <div class="ex-title">${escapeHtml(ex.name)}</div>
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
    const metrics = blocks.map((b) => ({ top: b.offsetTop, height: b.offsetHeight }));
    blocks.forEach((b) => { b.style.transition = "transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)"; });
    el.style.transition = "none";
    el.classList.add("ex-dragging");
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
    const dy = e.clientY - ctx.pointerStartY + scrollDelta;
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
      const draggedHeight = draggedMetric.height + 12; // include block's margin-bottom
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

    const finalIndex = ctx.currentIndex;
    exDragCtx = null;

    if (finalIndex !== ctx.exIdx && state.activeWorkout) {
      const arr = state.activeWorkout.exercises;
      const [moved] = arr.splice(ctx.exIdx, 1);
      arr.splice(finalIndex, 0, moved);
      saveActiveWorkout();
      render();
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
      case "home-chart-metric":
        if (homeChartMetric !== t.dataset.metric) { homeChartMetric = t.dataset.metric; render(); }
        break;
      case "complete-done": navigate("home"); break;
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
    const data = { settings: state.settings, customExercises: state.customExercises, routines: state.routines, workouts: state.workouts };
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
    if (!(await showConfirm("This replaces all current routines, workouts, and custom exercises with the contents of this backup file. This can't be undone.", { title: "Restore backup?", danger: true, okLabel: "Restore" }))) return;

    await Promise.all([DB.clear("exercises"), DB.clear("routines"), DB.clear("workouts")]);

    const customExercises = Array.isArray(data.customExercises) ? data.customExercises : [];
    const routines = Array.isArray(data.routines) ? data.routines : [];
    const workouts = Array.isArray(data.workouts) ? data.workouts : [];

    await Promise.all([
      ...customExercises.map((ex) => DB.put("exercises", ex)),
      ...routines.map((r) => DB.put("routines", r)),
      ...workouts.map((w) => DB.put("workouts", w)),
    ]);

    if (data.settings && typeof data.settings === "object") {
      state.settings = { ...state.settings, ...data.settings };
      saveSettings();
    }

    state.customExercises = customExercises;
    state.routines = routines;
    state.workouts = workouts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    await backfillEffortScores();

    showToast("Backup restored.");
    navigate("home");
  }

  async function resetData() {
    if (!(await showConfirm("This deletes all routines, workouts, and custom exercises.", { title: "Erase all data?", danger: true, okLabel: "Erase" }))) return;
    await Promise.all([DB.clear("exercises"), DB.clear("routines"), DB.clear("workouts")]);
    await DB.kvSet("activeWorkout", null);
    state.customExercises = [];
    state.routines = [];
    state.workouts = [];
    state.activeWorkout = null;
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
