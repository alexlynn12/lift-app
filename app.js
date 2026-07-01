/* Lift — personal workout tracker. Vanilla JS, no build step. */

(() => {
  "use strict";

  // ---------- Global state ----------
  const state = {
    settings: { unitMode: "both", activeUnit: "lb", defaultRestSec: 90, hapticsEnabled: true },
    customExercises: [],
    routines: [],
    workouts: [],
    activeWorkout: null, // { id, name, startedAt, exercises: [{exerciseId, name, restSec, sets:[{weight,reps,completed,isWarmup}]}] }
  };

  let restTimer = { endTime: null, raf: null, exerciseName: "" };

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
    if (settings) state.settings = settings;
    state.customExercises = customExercises || [];
    state.routines = routines || [];
    state.workouts = (workouts || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    state.activeWorkout = activeWorkout;

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

  function skipRest() {
    restTimer.endTime = null;
    saveRestTimer();
    cancelAnimationFrame(restTimer.raf);
    renderRestBar();
  }

  function startTimerLoop() {
    cancelAnimationFrame(restTimer.raf);
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
      restTimer.raf = requestAnimationFrame(() => setTimeout(tick, 200));
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

  function previousSetLabel(exerciseId, setIndex) {
    const found = lastCompletedWorkoutFor(exerciseId);
    if (!found) return "—";
    const completedSets = found.exercise.sets.filter((s) => s.completed);
    const s = completedSets[setIndex];
    if (!s) return "—";
    return `${weightToDisplay(s.weight)}×${s.reps}`;
  }

  // Builds a starting set list for an exercise that's just been added to a
  // workout, pre-filled with the weight/reps from the last time it was
  // performed so the person doesn't have to retype it. Falls back to blank
  // sets if there's no history yet. `count`, when given, pins the number of
  // sets (e.g. a routine's target set count); otherwise it matches however
  // many sets were completed last time, or defaults to 3.
  function defaultSetsForExercise(exerciseId, count) {
    const found = lastCompletedWorkoutFor(exerciseId);
    const completed = found ? found.exercise.sets.filter((s) => s.completed) : [];
    const n = count || completed.length || 3;
    return Array.from({ length: n }, (_, i) => {
      const prev = completed[i];
      return prev ? { weight: prev.weight, reps: prev.reps, completed: false } : { weight: "", reps: "", completed: false };
    });
  }

  function bestWeightFor(exerciseId, excludeWorkoutId) {
    let best = 0;
    for (const w of state.workouts) {
      if (w.id === excludeWorkoutId) continue;
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!ex) continue;
      for (const s of ex.sets) {
        if (s.completed && s.weight > best) best = s.weight;
      }
    }
    return best;
  }

  function estOneRm(weightLb, reps) {
    if (!reps || reps <= 0) return weightLb;
    return weightLb * (1 + reps / 30);
  }

  function startWorkout(routine) {
    const exercises = routine
      ? routine.exercises.map((re) => ({
          exerciseId: re.exerciseId,
          name: exerciseById(re.exerciseId)?.name || "Exercise",
          restSec: re.restSec || state.settings.defaultRestSec,
          sets: defaultSetsForExercise(re.exerciseId, re.targetSets || 3),
        }))
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
      const maxThis = Math.max(...e.sets.map((s) => s.weight || 0));
      if (maxThis > prevBest) prCount++;
    }

    const record = {
      id: w.id,
      name: w.name,
      routineId: w.routineId,
      date: w.startedAt,
      durationSec,
      exercises: cleanExercises,
      prCount,
    };
    await DB.put("workouts", record);
    state.workouts.unshift(record);
    state.activeWorkout = null;
    await DB.kvSet("activeWorkout", null);
    showToast(prCount > 0 ? `Workout saved · ${prCount} PR${prCount > 1 ? "s" : ""}` : "Workout saved");
    navigate("home");
  }

  function discardWorkout() {
    state.activeWorkout = null;
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
      window.scrollTo(0, 0);
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
              <div style="font-weight:600;">Workout in progress</div>
              <div class="small muted">${state.activeWorkout.name} · tap to resume</div>
            </div>
            <span class="badge badge-accent">Resume</span>
          </div>
        </div>` : ""}

      <button class="btn btn-primary" data-action="start-empty" style="margin-bottom:18px;">+ Start empty workout</button>

      <div class="section">
        <div class="row" style="margin-bottom:8px;">
          <h3 style="margin:0;">Routines</h3>
        </div>
        ${state.routines.length === 0 ? emptyStateHtml("No routines yet", "Create one to pre-load your sets each session.", "routines") : ""}
        ${state.routines.map((r) => `
          <div class="card card-tap" data-action="open-routine" data-id="${r.id}">
            <div class="row">
              <div>
                <div style="font-weight:600;">${escapeHtml(r.name)}</div>
                <div class="small muted">${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}</div>
              </div>
              <button class="btn btn-sm btn-accent" data-action="start-routine" data-id="${r.id}">Start</button>
            </div>
          </div>
        `).join("")}
        <button class="fab-add" data-action="new-routine">+ New routine</button>
      </div>

      ${last ? `
        <div class="section">
          <h3>Last workout</h3>
          <div class="card card-tap" data-action="view-workout" data-id="${last.id}">
            <div class="row">
              <div style="font-weight:600;">${escapeHtml(last.name)}</div>
              <div class="small muted">${fmtDate(last.date)}</div>
            </div>
            <div class="small muted" style="margin-top:4px;">${totalVolume(last)} ${unitLabel()} volume${last.prCount ? ` · ${last.prCount} PR${last.prCount > 1 ? "s" : ""}` : ""}</div>
          </div>
        </div>` : ""}
    `;
  }

  function totalVolume(workout) {
    let v = 0;
    for (const e of workout.exercises) for (const s of e.sets) v += (s.weight || 0) * (s.reps || 0);
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
              <div style="font-weight:600;">${escapeHtml(w.name)}</div>
              <div class="small muted">${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}</div>
            </div>
            <div class="row-gap">
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
            <div style="font-weight:500;">${escapeHtml(ex.name)}</div>
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
      <input type="text" id="ex-search" placeholder="Search exercises" value="${escapeHtml(params.q || "")}" style="margin-bottom:14px;" />
      <div>
        ${list.map((ex) => `
          <div class="list-row card-tap" data-action="view-exercise" data-id="${ex.id}">
            <div>
              <div style="font-weight:500;">${escapeHtml(ex.name)}</div>
              <div class="tiny muted">${ex.muscle} · ${ex.equipment}</div>
            </div>
            <span class="muted">›</span>
          </div>
        `).join("")}
      </div>
      <button class="fab-add" data-action="new-exercise" style="margin-top:14px;">+ Add custom exercise</button>
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
        if (completed.length) history.push({ date: w.date, sets: completed });
      }
    }
    let bestSet = null, bestE1rm = 0;
    history.forEach((h) => h.sets.forEach((s) => {
      const e1rm = estOneRm(s.weight, s.reps);
      if (e1rm > bestE1rm) { bestE1rm = e1rm; bestSet = s; }
    }));

    const chartPoints = history.slice(0, 12).reverse().map((h) => Math.max(...h.sets.map((s) => estOneRm(s.weight, s.reps))));

    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="back">‹ Back</button>
      </div>
      <h1>${escapeHtml(ex.name)}</h1>
      <div class="small muted" style="margin-top:-12px; margin-bottom:16px;">${ex.muscle} · ${ex.equipment}</div>

      ${bestSet ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
          <div class="card" style="margin-bottom:0;">
            <div class="tiny muted">Best set</div>
            <div style="font-size:18px; font-weight:600;">${weightToDisplay(bestSet.weight)} ${unitLabel()} × ${bestSet.reps}</div>
          </div>
          <div class="card" style="margin-bottom:0;">
            <div class="tiny muted">Est. 1RM</div>
            <div style="font-size:18px; font-weight:600;">${Math.round(weightToDisplay(bestE1rm))} ${unitLabel()}</div>
          </div>
        </div>
        <div class="chart-wrap">${renderLineChart(chartPoints)}</div>
      ` : emptyStateHtml("No history yet", "Log this exercise in a workout to see progress.", "history")}

      ${history.length ? `
        <h3>History</h3>
        ${history.map((h) => `
          <div class="list-row">
            <span class="muted small">${fmtDate(h.date)}</span>
            <span class="small">${h.sets.map((s) => `${weightToDisplay(s.weight)}×${s.reps}`).join(", ")}</span>
          </div>
        `).join("")}
      ` : ""}
    `;
  }

  function renderLineChart(points) {
    if (points.length < 2) {
      return `<svg viewBox="0 0 300 140" width="100%" height="140" role="img" aria-label="Not enough data yet"></svg>`;
    }
    const w = 300, h = 130, pad = 10;
    const min = Math.min(...points), max = Math.max(...points);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (p - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const path = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
    const last = coords[coords.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Progress chart trending over recent workouts">
      <path d="${path}" fill="none" stroke="#2f6fed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#2f6fed" />
    </svg>`;
  }

  function renderSettings() {
    const s = state.settings;
    const notif = notificationStatus();
    appEl.innerHTML = `
      <div class="topbar"><h1>Settings</h1></div>

      <div class="section">
        <h3>Units</h3>
        <div class="card">
          <div class="row" style="margin-bottom:${s.unitMode === "both" ? "10px" : "0"};">
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
        <h3>Rest timer</h3>
        <div class="card">
          <div class="row">
            <span>Default rest duration</span>
            <div class="row-gap">
              <button class="icon-btn" data-action="default-rest-adjust" data-delta="-15">-15</button>
              <span style="font-weight:600; min-width:48px; text-align:center;">${fmtTime(s.defaultRestSec)}</span>
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
          ${notif.canRequest ? `<button class="btn" style="margin-top:10px;" data-action="enable-notifications">Enable notifications</button>` : ""}
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

  function renderRoutineEdit(params) {
    let draft = renderRoutineEdit._draft;
    if (!draft || draft.id !== params.id) {
      const existing = state.routines.find((r) => r.id === params.id);
      draft = existing || { id: params.id, name: "New routine", exercises: [] };
      renderRoutineEdit._draft = draft;
    }

    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="back">‹ Back</button>
        <button class="btn btn-sm btn-primary" data-action="save-routine" data-id="${draft.id}">Save</button>
      </div>
      <input type="text" id="routine-name" value="${escapeHtml(draft.name)}" style="font-size:20px; font-weight:600; border:none; background:transparent; padding:4px 0; margin-bottom:16px;" />

      <div id="routine-exercises">
        ${draft.exercises.map((re, i) => {
          const ex = exerciseById(re.exerciseId);
          return `
          <div class="card">
            <div class="row">
              <div style="font-weight:600;">${ex ? escapeHtml(ex.name) : "Unknown"}</div>
              <button class="icon-btn" data-action="remove-routine-exercise" data-index="${i}">Remove</button>
            </div>
            <div class="row" style="margin-top:8px;">
              <span class="small muted">Sets</span>
              <div class="row-gap">
                <button class="icon-btn" data-action="routine-sets-adjust" data-index="${i}" data-delta="-1">-</button>
                <span style="min-width:20px; text-align:center; font-weight:600;">${re.targetSets || 3}</span>
                <button class="icon-btn" data-action="routine-sets-adjust" data-index="${i}" data-delta="1">+</button>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
      <button class="fab-add" data-action="add-routine-exercise">+ Add exercise</button>
      ${draft.exercises.length ? `<button class="btn btn-danger" style="margin-top:18px;" data-action="delete-routine" data-id="${draft.id}">Delete routine</button>` : ""}
    `;

    document.getElementById("routine-name").addEventListener("change", (e) => { draft.name = e.target.value || "Routine"; });
  }

  function renderWorkoutActive() {
    const w = state.activeWorkout;
    if (!w) { navigate("home"); return; }
    appEl.innerHTML = `
      <div class="topbar">
        <button class="back-btn" data-action="discard-workout">Discard</button>
        <button class="btn btn-sm btn-primary" data-action="finish-workout">Finish</button>
      </div>
      <input type="text" id="workout-name" value="${escapeHtml(w.name)}" style="font-size:20px; font-weight:600; border:none; background:transparent; padding:4px 0; margin-bottom:4px;" />
      <div class="tiny muted" style="margin-bottom:16px;">Started ${new Date(w.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>

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
  }

  function renderExerciseBlock(ex, exIdx) {
    const u = unitLabel();
    return `
      <div class="exercise-block">
        <div class="ex-header">
          <div class="ex-title">${escapeHtml(ex.name)}</div>
          <button class="icon-btn" data-action="remove-exercise" data-exidx="${exIdx}">Remove</button>
        </div>
        <div class="ex-rest-row">
          <div class="ex-rest">Rest between sets</div>
          <div class="row-gap">
            <button class="icon-btn" data-action="ex-rest-adjust" data-exidx="${exIdx}" data-delta="-15">-15</button>
            <span class="tiny" style="font-weight:600; min-width:36px; text-align:center;">${fmtTime(ex.restSec)}</span>
            <button class="icon-btn" data-action="ex-rest-adjust" data-exidx="${exIdx}" data-delta="15">+15</button>
          </div>
        </div>
        <table class="set-table">
          <tr><th>Set</th><th>Previous</th><th>${u}</th><th>Reps</th><th></th></tr>
          ${ex.sets.map((s, setIdx) => `
            <tr class="set-row ${s.completed ? "completed" : ""}">
              <td class="set-num">${setIdx + 1}</td>
              <td class="set-prev">${previousSetLabel(ex.exerciseId, setIdx)}</td>
              <td><input class="set-input" inputmode="decimal" type="number" step="0.5" data-action="set-weight" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.weight === "" ? "" : weightToDisplay(s.weight)}" placeholder="0" /></td>
              <td><input class="set-input" inputmode="numeric" type="number" step="1" data-action="set-reps" data-exidx="${exIdx}" data-setidx="${setIdx}" value="${s.reps === "" ? "" : s.reps}" placeholder="0" /></td>
              <td><button class="set-check ${s.completed ? "checked" : ""}" data-action="toggle-set" data-exidx="${exIdx}" data-setidx="${setIdx}" aria-label="Mark set complete">✓</button></td>
            </tr>
          `).join("")}
        </table>
        <button class="icon-btn" data-action="add-set" data-exidx="${exIdx}">+ Add set</button>
      </div>
    `;
  }

  function renderWorkoutDetail(params) {
    const w = state.workouts.find((x) => x.id === params.id);
    if (!w) { navigate("history"); return; }
    appEl.innerHTML = `
      <div class="topbar"><button class="back-btn" data-action="back">‹ Back</button></div>
      <h1>${escapeHtml(w.name)}</h1>
      <div class="small muted" style="margin-top:-12px; margin-bottom:16px;">${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}${w.prCount ? ` · ${w.prCount} PR${w.prCount > 1 ? "s" : ""}` : ""}</div>
      ${w.exercises.map((ex) => `
        <div class="exercise-block">
          <div class="ex-title">${escapeHtml(ex.name)}</div>
          <table class="set-table">
            <tr><th>Set</th><th>${unitLabel()}</th><th>Reps</th></tr>
            ${ex.sets.map((s, i) => `<tr><td class="set-num">${i + 1}</td><td>${weightToDisplay(s.weight)}</td><td>${s.reps}</td></tr>`).join("")}
          </table>
        </div>
      `).join("")}
      <button class="btn btn-danger" style="margin-top:8px;" data-action="delete-workout" data-id="${w.id}">Delete workout</button>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

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
      case "routine-sets-adjust": {
        const re = renderRoutineEdit._draft.exercises[parseInt(t.dataset.index, 10)];
        re.targetSets = Math.max(1, (re.targetSets || 3) + parseInt(t.dataset.delta, 10));
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
        const completed = ex.sets.filter((s) => s.completed);
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
      renderRoutineEdit._draft.exercises.push({ exerciseId: ex.id, targetSets: 3, restSec: state.settings.defaultRestSec });
      closeExercisePicker();
      render();
    } else if (pickerContext === "workout") {
      state.activeWorkout.exercises.push({
        exerciseId: ex.id,
        name: ex.name,
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
