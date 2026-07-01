/* Lift — personal workout tracker. Vanilla JS, no build step. */

(() => {
  "use strict";

  // ---------- Global state ----------
  const state = {
    settings: { unitMode: "both", activeUnit: "lb", defaultRestSec: 90, hapticsEnabled: true, bodyWeightLb: null, heightIn: null },
    customExercises: [],
    routines: [],
    workouts: [],
    activeWorkout: null, // { id, name, startedAt, exercises: [{exerciseId, name, restSec, sets:[{weight,reps,completed,isWarmup}]}] }
  };

  let restTimer = { endTime: null, raf: null, timeoutId: null, exerciseName: "" };

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

  confirmCancelBtn.addEventListener("click", () => { vibrateTap(); closeConfirm(false); });
  confirmOkBtn.addEventListener("click", () => { vibrateTap(); closeConfirm(true); });

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
    exerciseMenuOverlayEl.classList.remove("hidden");
    requestAnimationFrame(() => exerciseMenuOverlayEl.classList.add("open"));
  }

  function closeExerciseMenu() {
    exerciseMenuOverlayEl.classList.remove("open");
    setTimeout(() => exerciseMenuOverlayEl.classList.add("hidden"), 180);
    exerciseMenuIndex = null;
  }

  exerciseMenuCloseBtn.addEventListener("click", () => { vibrateTap(); closeExerciseMenu(); });

  exerciseMenuActionsEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    vibrateTap();
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
    }
  });

  menuNoteSaveBtn.addEventListener("click", () => {
    vibrateTap();
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
    const m = Math.floor(s / 60);
    const sec = s % 60;
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
    state.customExercises = customExercises || [];
    state.routines = routines || [];
    state.workouts = (workouts || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activeWorkout = activeWorkout;

    await backfillEffortScores();

    const savedTimer = await DB.kvGet("restTimer", null);
    if (savedTimer && savedTimer.endTime > Date.now()) {
      restTimer.endTime = savedTimer.endTime;
      restTimer.exerciseName = savedTimer.exerciseName;
      startTimerLoop();
    }
  }

  function saveSettings() { DB.kvSet("settings", state.settings); }
  function saveActiveWorkout() { DB.kvSet("activeWorkout", state.activeWorkout); }
  function saveRestTimer() {
    DB.kvSet("restTimer", restTimer.endTime ? { endTime: restTimer.endTime, exerciseName: restTimer.exerciseName } : null);
  }

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

  // ---------- Notifications ----------
  function notificationStatus() {
    if (!("Notification" in window)) return { label: "Not supported", cls: "badge-muted", canRequest: false };
    if (Notification.permission === "granted") return { label: "Enabled", cls: "badge-success", canRequest: false };
    if (Notification.permission === "denied") return { label: "Blocked", cls: "badge-muted", canRequest: false };
    return { label: "Not enabled", cls: "badge-muted", canRequest: true };
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) { showToast("Notifications aren't supported in this browser"); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") showToast("Notifications enabled");
      else if (perm === "denied") showToast("Blocked — enable in Settings > Notifications");
    } catch (e) { /* ignore */ }
    render();
  }

  async function notifyRestDone(exerciseName) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const title = "Rest complete";
    const body = exerciseName ? `Time for your next set — ${exerciseName}` : "Time for your next set";
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "rest-timer", renotify: true });
      } else {
        new Notification(title, { body, icon: "icons/icon-192.png" });
      }
    } catch (e) { /* notifications unavailable */ }
  }

  // ---------- Rest timer ----------
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.45);
    } catch (e) { /* audio not available */ }
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  }

  function startRest(seconds, exerciseName) {
    restTimer.endTime = Date.now() + seconds * 1000;
    restTimer.exerciseName = exerciseName;
    saveRestTimer();
    startTimerLoop();
  }

  function adjustRest(deltaSec) {
    if (!restTimer.endTime) return;
    restTimer.endTime += deltaSec * 1000;
    if (restTimer.endTime < Date.now()) restTimer.endTime = Date.now();
    saveRestTimer();
    renderRestBar();
  }

  // Stops the countdown loop dead, right now — cancels both the pending
  // animation frame AND the pending setTimeout it schedules (see
  // startTimerLoop below), so there's no stray tick left in flight that
  // could resurrect the bar or re-fire the "rest done" beep/notification
  // a moment later.
  function stopTimerLoop() {
    cancelAnimationFrame(restTimer.raf);
    clearTimeout(restTimer.timeoutId);
    restTimer.raf = null;
    restTimer.timeoutId = null;
  }

  function skipRest() {
    restTimer.endTime = null;
    saveRestTimer();
    stopTimerLoop();
    renderRestBar();
  }

  function startTimerLoop() {
    stopTimerLoop();
    const tick = () => {
      if (!restTimer.endTime) { renderRestBar(); return; }
      const remaining = (restTimer.endTime - Date.now()) / 1000;
      if (remaining <= 0) {
        beep();
        notifyRestDone(restTimer.exerciseName);
        restTimer.endTime = null;
        saveRestTimer();
        renderRestBar();
        return;
      }
      renderRestBar();
      restTimer.raf = requestAnimationFrame(() => {
        restTimer.timeoutId = setTimeout(tick, 200);
      });
    };
    tick();
  }

  function renderRestBar() {
    const bar = document.getElementById("restbar");
    const timeEl = document.getElementById("restbar-time");
    if (restTimer.endTime) {
      const remaining = (restTimer.endTime - Date.now()) / 1000;
      bar.classList.remove("hidden");
      timeEl.textContent = fmtTime(remaining);
      // Reserve space at the top of #app equal to the bar's real height so it
      // never overlaps the topbar (e.g. the Finish button) while resting.
      document.documentElement.style.setProperty("--restbar-h", bar.offsetHeight + "px");
    } else {
      bar.classList.add("hidden");
      document.documentElement.style.setProperty("--restbar-h", "0px");
    }
  }

  document.getElementById("rest-minus").addEventListener("click", () => { vibrateTap(); adjustRest(-15); });
  document.getElementById("rest-plus").addEventListener("click", () => { vibrateTap(); adjustRest(15); });
  document.getElementById("rest-skip").addEventListener("click", () => { vibrateTap(); skipRest(); });

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

  // ---------- Effort scoring ----------
  // Every completed workout gets a 0-100 "effort score" that blends three
  // things: how much weight/reps you actually moved (volume), how close
  // each set was to your all-time best for that exercise (intensity — so
  // grinding near a PR outranks easy-weight volume), and how inherently
  // demanding the exercise itself is (a squat taxes far more than a curl,
  // even at the "same" relative intensity). The score is normalized
  // against your own historical best, so it self-calibrates as you get
  // stronger instead of chasing a fixed, arbitrary ceiling.

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

  // Assumed effort-intensity for the very first time you ever log an
  // exercise, when there's no personal-best history yet to compare against.
  const NEW_EXERCISE_INTENSITY = 0.7;
  // Fallback body weight (lb) used for bodyweight exercises if the person
  // hasn't entered their real body weight in Settings yet.
  const DEFAULT_BODYWEIGHT_LB = 150;

  function effectiveLoad(set, ex) {
    const weight = set.weight || 0;
    if (ex && ex.equipment === "Bodyweight") {
      return weight + (state.settings.bodyWeightLb || DEFAULT_BODYWEIGHT_LB);
    }
    return weight;
  }

  // Per-set contribution to a workout's effort score. Warmups and empty
  // sets contribute nothing. Intensity is this set's estimated 1RM as a
  // fraction of your all-time best for the exercise (capped so one huge
  // PR set doesn't dominate the whole workout), so the same rep count
  // scores higher when it's genuinely close to your limit.
  function computeSetEffort(set, ex, bestE1rm) {
    if (!set || !set.completed || set.isWarmup) return 0;
    const reps = set.reps || 0;
    if (reps <= 0) return 0;
    const load = effectiveLoad(set, ex);
    const thisE1rm = estOneRm(load, reps);
    const intensity = bestE1rm > 0
      ? Math.max(0.3, Math.min(1.3, thisE1rm / bestE1rm))
      : NEW_EXERCISE_INTENSITY;
    const heightFactor = heightRomFactor(ex, state.settings.heightIn);
    return reps * intensity * exerciseDifficulty(ex) * heightFactor;
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
  // more direct "different exercises worked" signal. A single exercise
  // hitting a single muscle group lands around 0.3; a well-rounded
  // 4+-exercise, 3+-muscle-group session hits the full 1.0.
  function workoutCoverage(exercises) {
    if (!exercises || exercises.length === 0) return 0;
    const muscles = new Set();
    for (const e of exercises) {
      const ex = exerciseById(e.exerciseId);
      if (ex) muscles.add(ex.muscle);
    }
    const countFactor = Math.min(1, exercises.length / 4);
    const muscleFactor = Math.min(1, muscles.size / 3);
    return 0.4 * countFactor + 0.6 * muscleFactor;
  }

  // Raw (unbounded) effort total for a set of exercises, e.g. the working
  // sets logged in one workout — discounted by how complete the session
  // was (see workoutCoverage) so a single hard-hit exercise doesn't
  // out-rank a fuller, more balanced workout just because it was heavier.
  function computeWorkoutEffort(exercises) {
    let raw = 0;
    for (const e of exercises) {
      const ex = exerciseById(e.exerciseId);
      if (!ex) continue;
      const best = bestE1rmAllTime(e.exerciseId);
      for (const s of e.sets) raw += computeSetEffort(s, ex, best);
    }
    return raw * workoutCoverage(exercises);
  }

  // Converts a raw effort total into a 0-100 score by comparing it against
  // the hardest workout on record so far (state.workouts must reflect only
  // *prior* workouts when this is called — see finishWorkout). Your
  // toughest session to date always reads ~100; everything else scales
  // relative to it, so the score self-calibrates as you progress instead
  // of chasing a fixed, arbitrary number.
  function effortScoreFromRaw(raw) {
    let bestPrior = 0;
    for (const w of state.workouts) {
      if (typeof w.effortRaw === "number" && w.effortRaw > bestPrior) bestPrior = w.effortRaw;
    }
    const denom = Math.max(raw, bestPrior) || 1;
    return Math.round((raw / denom) * 100);
  }

  // Coverage discounts the raw score going into that historical
  // comparison above, which handles things fairly once there's real
  // history to compare against — but the very first workout you ever log
  // has nothing to compare against, so it would otherwise trivially read
  // 100% no matter how narrow it was. This hard-caps the *displayed*
  // score at what the session's coverage alone would justify, so a
  // single-exercise session can never read as near-total effort,
  // regardless of what it's being compared to.
  function finalEffortScore(raw, exercises) {
    const relative = effortScoreFromRaw(raw);
    const cap = Math.round(workoutCoverage(exercises) * 100);
    return Math.min(relative, cap);
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
  const EFFORT_SCORE_VERSION = 2;

  // One-time-per-version migration: (re)computes effortRaw/effortScore for
  // any workout that either predates this feature or was scored under an
  // older formula version, so history isn't left blank or inconsistent
  // with how new workouts get scored. Walked chronologically (oldest
  // first) so each workout's score is only ever judged against what had
  // actually happened by that point in time.
  async function backfillEffortScores() {
    if (state.workouts.length === 0) return;
    if (state.workouts.every((w) => w.effortVersion === EFFORT_SCORE_VERSION)) return;
    const chron = [...state.workouts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const bestE1rmSoFar = {};
    let bestRawSoFar = 0;
    for (const w of chron) {
      if (w.effortVersion !== EFFORT_SCORE_VERSION) {
        let raw = 0;
        for (const e of w.exercises) {
          const ex = exerciseById(e.exerciseId);
          if (!ex) continue;
          const priorBest = bestE1rmSoFar[e.exerciseId] || 0;
          for (const s of e.sets) raw += computeSetEffort(s, ex, priorBest);
        }
        const coverage = workoutCoverage(w.exercises);
        raw *= coverage;
        const denom = Math.max(raw, bestRawSoFar) || 1;
        const relative = Math.round((raw / denom) * 100);
        w.effortRaw = raw;
        w.effortScore = Math.min(relative, Math.round(coverage * 100));
        w.effortVersion = EFFORT_SCORE_VERSION;
        await DB.put("workouts", w);
      }
      if (w.effortRaw > bestRawSoFar) bestRawSoFar = w.effortRaw;
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
            restSec: re.restSec || state.settings.defaultRestSec,
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
    // *prior* workouts (bestE1rmAllTime / effortScoreFromRaw both scan it),
    // so this has to happen before the unshift below.
    const effortRaw = computeWorkoutEffort(cleanExercises);
    const effortScore = finalEffortScore(effortRaw, cleanExercises);

    const record = {
      id: w.id,
      name: w.name,
      routineId: w.routineId,
      date: w.startedAt,
      durationSec,
      exercises: cleanExercises,
      prCount,
      effortRaw,
      effortScore,
      effortVersion: EFFORT_SCORE_VERSION,
    };
    await DB.put("workouts", record);
    state.workouts.unshift(record);
    state.activeWorkout = null;
    stopWorkoutClock();
    skipRest();
    await DB.kvSet("activeWorkout", null);
    navigate("workout-complete", { id: record.id });
  }

  function discardWorkout() {
    state.activeWorkout = null;
    stopWorkoutClock();
    skipRest();
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
    // Keep the rest-timer bar (and the #app top padding that makes room for
    // it) in sync no matter which screen we just rendered.
    renderRestBar();

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

  function renderHome() {
    const last = state.workouts[0];
    appEl.innerHTML = `
      <div class="topbar"><h1>Workouts</h1></div>

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
  }

  function totalVolume(workout) {
    let v = 0;
    for (const e of workout.exercises) for (const s of e.sets) if (!s.isWarmup) v += (s.weight || 0) * (s.reps || 0);
    return Math.round(weightToDisplay(v) || 0).toLocaleString();
  }

  function renderHistory(params) {
    const tab = params.tab || "workouts";
    appEl.innerHTML = `
      <div class="topbar"><h1>History</h1></div>
      <div class="segmented" style="margin-bottom:16px;">
        <button data-action="history-tab" data-tab="workouts" class="${tab === "workouts" ? "active" : ""}">Workouts</button>
        <button data-action="history-tab" data-tab="exercises" class="${tab === "exercises" ? "active" : ""}">Exercises</button>
      </div>
      <div id="history-body"></div>
    `;
    const body = document.getElementById("history-body");
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
              <button class="icon-btn icon-btn-danger" data-action="delete-workout" data-id="${w.id}" aria-label="Delete workout">Delete</button>
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
      .map((h) => ({ date: h.date, weightLb: Math.max(...h.workingSets.map((s) => s.weight || 0)) }));

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
        <div class="chart-wrap">${renderLineChart(chartData)}</div>
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

    if (bestSet && chartData.length >= 2) initProgressChart(document.getElementById("progress-chart"), chartData);
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

  // Renders the weight-over-time trend chart for an exercise. Teal always
  // encodes weight (the line + y-axis), orange always encodes time (ticks,
  // date labels, the drag cursor) — colors sampled from the app icon.
  function renderLineChart(data) {
    if (data.length < 2) {
      return `<div class="chart-empty">Log one more session to see your trend</div>`;
    }
    const W = 320, H = 176, padX = 14, padTop = 18, padBottom = 34;
    const baseY = H - padBottom;
    const disp = data.map((d) => (displayUnit() === "kg" ? lbToKg(d.weightLb) : d.weightLb));
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
        <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weight progress over recent sessions">
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
  function initProgressChart(container, data) {
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

      const weightLb = data[i].weightLb;
      const wDisp = displayUnit() === "kg" ? lbToKg(weightLb) : weightLb;
      tooltip.innerHTML = `<span class="tt-weight">${roundClean(wDisp)} ${unitLabel()}</span><span class="tt-date">${escapeHtml(fmtDate(data[i].date))}</span>`;
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

  function renderSettings() {
    const s = state.settings;
    const notif = notificationStatus();
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
                value="${s.bodyWeightLb ? weightToDisplay(s.bodyWeightLb) : ""}" placeholder="${DEFAULT_BODYWEIGHT_LB}"
                style="width:64px; text-align:right; font-weight:700; border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 8px; background:var(--surface);" />
              <span class="muted small">${unitLabel()}</span>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px; margin-bottom:12px;">Used to score bodyweight exercises (push-ups, pull-ups, planks) in your effort score. Without this we assume ${DEFAULT_BODYWEIGHT_LB} lb.</div>
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
        <h3>Rest timer</h3>
        <div class="card">
          <div class="row">
            <span>Default rest duration</span>
            <div class="row-gap">
              <button class="icon-btn" data-action="default-rest-adjust" data-delta="-15">-15</button>
              <span style="font-weight:700; min-width:48px; text-align:center;">${fmtTime(s.defaultRestSec)}</span>
              <button class="icon-btn" data-action="default-rest-adjust" data-delta="15">+15</button>
            </div>
          </div>
          <div class="tiny muted" style="margin-top:8px;">Rest starts automatically whenever you mark a set complete. Each exercise can override this during a workout.</div>
        </div>
      </div>

      <div class="section">
        <h3>Notifications</h3>
        <div class="card">
          <div class="row">
            <span>Rest timer alerts</span>
            <span class="badge ${notif.cls}">${notif.label}</span>
          </div>
          ${notif.canRequest ? `<button class="btn" style="margin-top:12px;" data-action="enable-notifications">Enable notifications</button>` : ""}
          <div class="tiny muted" style="margin-top:8px;">On iPhone, you need to add Lift to your Home Screen first (Share &rarr; Add to Home Screen) — Safari only allows notifications for installed web apps.</div>
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
          <button class="btn" data-action="export-data" style="margin-bottom:8px;">Export backup</button>
          <button class="btn btn-danger" data-action="reset-data">Erase all data</button>
        </div>
      </div>
    `;
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
    if (re.restSec == null) re.restSec = state.settings.defaultRestSec;
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
                <tr class="rest-divider-row"><td colspan="4">
                  <div class="rest-divider">
                    <button class="rest-divider-btn" data-action="routine-rest-adjust" data-index="${i}" data-delta="-15" aria-label="Decrease rest 15 seconds">−15</button>
                    <span class="rest-divider-time">${fmtTime(re.restSec)}</span>
                    <button class="rest-divider-btn" data-action="routine-rest-adjust" data-index="${i}" data-delta="15" aria-label="Increase rest 15 seconds">+15</button>
                  </div>
                </td></tr>
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
      <div class="topbar">
        <button class="back-btn" data-action="discard-workout">Discard</button>
        <span class="workout-clock" id="workout-elapsed">${fmtTime((Date.now() - new Date(w.startedAt).getTime()) / 1000)}</span>
        <button class="btn btn-sm btn-primary" data-action="finish-workout">Finish</button>
      </div>
      <input type="text" id="workout-name" class="title-input" value="${escapeHtml(w.name)}" />

      <div id="workout-exercises">
        ${w.exercises.map((ex, exIdx) => renderExerciseBlock(ex, exIdx)).join("")}
      </div>

      <button class="fab-add" data-action="add-workout-exercise">+ Add exercise</button>
    `;
    document.getElementById("workout-name").addEventListener("change", (e) => {
      w.name = e.target.value || "Workout";
      saveActiveWorkout();
    });
    renderRestBar();
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

  function renderExerciseBlock(ex, exIdx) {
    const u = unitLabel();
    let workingNum = 0;
    return `
      <div class="exercise-block">
        <div class="ex-header">
          <div>
            <div class="ex-title">${escapeHtml(ex.name)}</div>
            ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ""}
          </div>
          <div class="ex-header-actions">
            <button class="ex-menu-btn" data-action="workout-ex-menu" data-exidx="${exIdx}" aria-label="Exercise options">${ICONS.kebab}</button>
            <button class="icon-btn icon-btn-danger" data-action="remove-exercise" data-exidx="${exIdx}">Remove</button>
          </div>
        </div>
        <table class="set-table">
          <tr><th>Set</th><th>Previous</th><th>${u}</th><th>Reps</th><th></th><th></th></tr>
          ${ex.sets.map((s, setIdx) => {
            const isWarmup = !!s.isWarmup;
            const label = isWarmup ? "W" : (++workingNum);
            const prevLabel = isWarmup ? "—" : previousSetLabel(ex.exerciseId, workingNum - 1);
            return `
            <tr class="set-row ${s.completed ? "completed" : ""} ${isWarmup ? "warmup" : ""}">
              <td class="set-num">${label}</td>
              <td class="set-prev">${prevLabel}</td>
              <td><input class="set-input" inputmode="decimal" type="number" step="0.5" data-action="set-weight" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.weight === "" ? "" : weightToDisplay(s.weight)}" placeholder="0" /></td>
              <td><input class="set-input" inputmode="numeric" type="number" step="1" data-action="set-reps" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.reps === "" ? "" : s.reps}" placeholder="0" /></td>
              <td><button class="set-check ${s.completed ? "checked" : ""}" data-action="toggle-set" data-exidx="${exIdx}" data-setidx="${setIdx}" aria-label="Mark set complete">${ICONS.check}</button></td>
              <td><button class="set-remove-btn" data-action="remove-set" data-exidx="${exIdx}" data-setidx="${setIdx}" aria-label="Remove set">${ICONS.close}</button></td>
            </tr>
            <tr class="rest-divider-row"><td colspan="6">
              <div class="rest-divider">
                <button class="rest-divider-btn" data-action="ex-rest-adjust" data-exidx="${exIdx}" data-delta="-15" aria-label="Decrease rest 15 seconds">−15</button>
                <span class="rest-divider-time">${fmtTime(ex.restSec)}</span>
                <button class="rest-divider-btn" data-action="ex-rest-adjust" data-exidx="${exIdx}" data-delta="15" aria-label="Increase rest 15 seconds">+15</button>
              </div>
            </td></tr>
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
          <div class="effort-ring-value">${score}<span class="effort-ring-pct">%</span></div>
          <div class="effort-ring-label">Effort</div>
        </div>
      </div>
    `;
  }

  function initEffortRing(container) {
    if (!container) return;
    const score = Math.max(0, Math.min(100, parseFloat(container.dataset.score) || 0));
    const circle = container.querySelector(".effort-ring-progress");
    const r = 52, c = 2 * Math.PI * r;
    const target = c * (1 - score / 100);
    void container.getBoundingClientRect();
    requestAnimationFrame(() => {
      circle.style.transition = "stroke-dashoffset 0.9s cubic-bezier(0.65, 0, 0.35, 1)";
      circle.style.strokeDashoffset = `${target}`;
    });
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
        return `
        <div class="exercise-block">
          <div class="ex-title">${escapeHtml(ex.name)}</div>
          ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ""}
          <table class="set-table">
            <tr><th>Set</th><th>${unitLabel()}</th><th>Reps</th></tr>
            ${ex.sets.map((s) => `<tr class="set-row ${s.isWarmup ? "warmup" : ""}"><td class="set-num">${s.isWarmup ? "W" : ++workingNum}</td><td>${weightToDisplay(s.weight)}</td><td>${s.reps}</td></tr>`).join("")}
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

  function onAppClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    const { route } = parseHash();
    vibrateTap();

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
      case "complete-done": navigate("home"); break;
      case "delete-workout": deleteWorkout(t.dataset.id); break;
      case "view-exercise": navigate("exercise-detail", { id: t.dataset.id }); break;
      case "history-tab": navigate("history", { tab: t.dataset.tab }); break;
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
      case "default-rest-adjust":
        state.settings.defaultRestSec = Math.max(0, state.settings.defaultRestSec + parseInt(t.dataset.delta, 10));
        saveSettings(); render();
        break;
      case "set-haptics":
        state.settings.hapticsEnabled = t.dataset.value === "on";
        saveSettings(); render();
        break;
      case "enable-notifications": requestNotificationPermission(); break;
      case "export-data": exportData(); break;
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
      case "routine-rest-adjust": {
        const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
        re.restSec = Math.max(0, re.restSec + parseInt(t.dataset.delta, 10));
        render();
        break;
      }
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
      case "ex-rest-adjust": {
        const ex = state.activeWorkout.exercises[parseInt(t.dataset.exidx, 10)];
        ex.restSec = Math.max(0, ex.restSec + parseInt(t.dataset.delta, 10));
        saveActiveWorkout(); render();
        break;
      }
      case "toggle-set": {
        const exIdx = parseInt(t.dataset.exidx, 10), setIdx = parseInt(t.dataset.setidx, 10);
        const ex = state.activeWorkout.exercises[exIdx];
        const s = ex.sets[setIdx];
        s.completed = !s.completed;
        if (s.completed) {
          if (s.weight === "" ) s.weight = 0;
          if (s.reps === "") s.reps = 0;
          startRest(ex.restSec, ex.name);
        }
        saveActiveWorkout(); render();
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
    } else if (action === "routine-set-weight" || action === "routine-set-reps") {
      const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
      const s = re.sets[parseInt(t.dataset.setidx, 10)];
      if (action === "routine-set-weight") s.weight = t.value === "" ? "" : weightFromDisplay(t.value);
      else s.reps = t.value === "" ? "" : (parseInt(t.value, 10) || 0);
    } else if (action === "set-bodyweight") {
      state.settings.bodyWeightLb = t.value === "" ? null : weightFromDisplay(t.value);
      saveSettings();
    } else if (action === "set-height") {
      state.settings.heightIn = t.value === "" ? null : heightFromDisplay(t.value);
      saveSettings();
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
  let pickerContext = null; // "routine" | "workout"
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

  function closeExercisePicker() {
    const overlay = document.getElementById("exercise-picker");
    overlay.classList.remove("open");
    setTimeout(() => overlay.classList.add("hidden"), 220);
    pickerContext = null;
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
    document.getElementById("picker-title").textContent = "Add exercise";
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

  document.getElementById("new-exercise-cancel").addEventListener("click", () => { vibrateTap(); closeNewExerciseModal(); });
  document.getElementById("new-exercise-body").addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    vibrateTap();
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
        restSec: state.settings.defaultRestSec,
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
        restSec: state.settings.defaultRestSec,
        sets: defaultSetsForExercise(ex.id),
      });
      saveActiveWorkout();
      closeExercisePicker();
      render();
    } else {
      closeExercisePicker();
    }
  }

  document.getElementById("picker-close").addEventListener("click", () => {
    vibrateTap();
    if (pickerViewMode === "create") showPickerListView();
    else closeExercisePicker();
  });
  document.getElementById("picker-search").addEventListener("input", renderPickerList);
  document.getElementById("picker-filter-muscle").addEventListener("change", renderPickerList);
  document.getElementById("picker-filter-equipment").addEventListener("change", renderPickerList);
  document.getElementById("picker-list").addEventListener("click", (e) => {
    const row = e.target.closest('[data-action="picker-select"]');
    if (!row) return;
    vibrateTap();
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
    vibrateTap();
    openCreateExercise();
  });
  document.getElementById("picker-create-body").addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    vibrateTap();
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
    a.download = `lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function resetData() {
    if (!(await showConfirm("This deletes all routines, workouts, and custom exercises.", { title: "Erase all data?", danger: true, okLabel: "Erase" }))) return;
    await Promise.all([DB.clear("exercises"), DB.clear("routines"), DB.clear("workouts")]);
    await DB.kvSet("activeWorkout", null);
    state.customExercises = [];
    state.routines = [];
    state.workouts = [];
    state.activeWorkout = null;
    skipRest();
    navigate("home");
  }

  // ---------- Init ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => { vibrateTap(); navigate(tab.dataset.route); });
  });

  (async function init() {
    await loadAll();
    if (!location.hash) location.hash = "#home";
    render();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  })();
})();
