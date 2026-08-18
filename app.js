"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6L18 6v12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 4h2v8.17l3.09-3.09L17.5 10.5 12 16l-5.5-5.5 1.41-1.42L11 12.17V4zM5 18h14v2H5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4l-1.4-1.4z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.17l3.09-3.09 1.41 1.42L12 16l-4.5-4.5 1.41-1.42L12 13.17V3zM5 19h14v2H5z"/></svg>',
  heard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
};

const AUDIO_CACHE = "tkgtm-audio-v1";
const SAVED_KEY = "tkgtm.saved.v1";
const HEARD_KEY = "tkgtm.heard.v1";
const PLAYBACK_KEY = "tkgtm.playback.v1";
const BASE = "https://www.tkgtm.com";

const state = {
  q: "", year: "", series: "", sort: "year", savedOnly: false, heardOnly: false,
  playing: null, list: [], all: [], saved: new Set(), heard: new Set(),
  visible: 200, rate: 1, loadingId: null, resume: null,
};
const audio = $("audio");
let deferredInstall = null;
let pendingSeek = 0;
let lastPlaybackSave = 0;
let manualPause = false;
let resumeAfterInterruption = false;

/* ---------- data ---------- */
function yearValue(y){ return y === "Unknown" ? null : parseInt(y, 10); }

function filterList(){
  let out = state.all;
  if (state.year) out = out.filter((d) => d.year === state.year);
  if (state.series) out = out.filter((d) => d.series === state.series);
  if (state.savedOnly) out = out.filter((d) => state.saved.has(d.id));
  if (state.heardOnly) out = out.filter((d) => state.heard.has(d.id));
  const q = state.q.trim().toLowerCase();
  if (q) {
    out = out.filter((d) =>
      [d.title, d.series, d.place, d.verse, d.festival, d.occasion, d.translation, d.year]
        .some((v) => (v || "").toLowerCase().includes(q)));
  }
  out = out.slice();
  if (state.sort === "year") {
    out.sort((a, b) => {
      const ya = yearValue(a.year), yb = yearValue(b.year);
      if (ya === yb) return (b.id || 0) - (a.id || 0);
      if (ya == null) return 1; if (yb == null) return -1;
      return yb - ya;
    });
  } else if (state.sort === "title") {
    out.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    out.sort((a, b) => secs(a.length) - secs(b.length));
  }
  return out;
}

function secs(len){
  const m = /^(\d+):(\d+)/.exec(len || "");
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

function fmtMeta(l){
  const p = [l.year, l.place, l.verse, l.festival, l.translation].filter(Boolean);
  return p.join(" \u00b7 ");
}

function rowMeta(l){
  const p = [l.year, l.place, l.verse].filter(Boolean).join(" \u00b7 ");
  return `${esc(p)}${l.length ? ' &nbsp;<span class="len">' + esc(l.length) + "</span>" : ""}` +
    (l.series ? '<span class="tag">' + esc(l.series) + "</span>" : "");
}

/* ---------- render ---------- */
function buildYears(){
  const ys = [...new Set(state.all.map((d) => d.year))].sort((a, b) => {
    if (a === "Unknown") return 1; if (b === "Unknown") return -1; return b.localeCompare(a);
  });
  const wrap = $("years");
  wrap.innerHTML = "";
  const mk = (label, value) => {
    const c = document.createElement("button");
    c.className = value && state.year === value ? "active" : "";
    c.textContent = label;
    c.onclick = () => { state.year = state.year === value ? "" : value; buildYears(); render(); };
    wrap.appendChild(c);
  };
  mk("All", "");
  ys.forEach((y) => mk(y, y));
}

function buildSeries(){
  const ss = [...new Set(state.all.map((d) => d.series).filter(Boolean))].sort();
  const sel = $("series");
  sel.innerHTML = '<option value="">All series</option>';
  ss.forEach((s) => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
}

function rowHTML(l){
  const active = state.playing === l.id;
  const loading = state.loadingId === l.id;
  const playing = active && !loading && !audio.paused;
  const saved = state.saved.has(l.id);
  const heard = state.heard.has(l.id);
  const progress = state.resume && state.resume.id === l.id && state.resume.duration > 0
    ? Math.min(100, (state.resume.position / state.resume.duration) * 100) : 0;
  return `<li data-id="${l.id}">
    <div class="episode-no" aria-hidden="true">${String(state.list.indexOf(l) + 1).padStart(2, "0")}</div>
    <button class="play-btn${playing ? " playing" : ""}${loading ? " loading" : ""}" data-act="play" aria-label="${loading ? "Loading audio" : playing ? "Pause" : "Play"}" ${loading ? 'aria-busy="true"' : ""}>${loading ? '<span class="audio-loader" aria-hidden="true"></span>' : playing ? ICONS.pause : ICONS.play}</button>
    <div class="row-body" data-act="play">
      <div class="row-title">${esc(l.title)}</div>
      <div class="row-meta">${rowMeta(l)}</div>
      ${progress > 1 && progress < 90 ? `<progress class="row-progress" max="100" value="${progress}" title="${Math.round(progress)}% listened"></progress>` : ""}
    </div>
    <div class="row-actions">
      <button class="heard-btn${heard ? " heard" : ""}" data-act="heard" aria-label="${heard ? "Mark as unheard" : "Mark as heard"}" title="${heard ? "Heard" : "Mark heard"}">${ICONS.heard}</button>
      <button class="save-btn${saved ? " saved" : ""}" data-act="save" aria-label="${saved ? "Remove from offline" : "Save offline"}">${saved ? ICONS.check : ICONS.dl}</button>
    </div>
  </li>`;
}

function render(){
  state.list = filterList();
  $("count").textContent =
    `${state.list.length} lecture${state.list.length === 1 ? "" : "s"}` +
    (state.savedOnly ? " \u00b7 saved" : "") +
    (state.heardOnly ? " \u00b7 heard" : "") +
    (state.saved.size ? ` \u00b7 ${state.saved.size} offline` : "");

  const list = $("list");
  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  const shown = state.list.slice(0, state.visible);
  for (const l of shown) {
    const div = document.createElement("div");
    div.innerHTML = rowHTML(l);
    frag.appendChild(div.firstElementChild);
  }
  list.appendChild(frag);

  $("empty").hidden = state.list.length > 0;
  $("empty-text").textContent = state.savedOnly
    ? "Nothing saved yet \u2014 tap the download icon on a lecture to keep it offline."
    : state.heardOnly ? "No lectures marked as heard yet."
    : "No lectures match your search.";

  if (state.visible < state.list.length) {
    const more = document.createElement("button");
    more.className = "load-more";
    more.textContent = `Load ${Math.min(200, state.list.length - state.visible)} more`;
    more.onclick = () => { state.visible += 200; render(); };
    list.appendChild(more);
  }
}

/* ---------- list interaction (whole row plays) ---------- */
$("list").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const id = parseInt(li.dataset.id, 10);
  const l = state.all.find((x) => x.id === id);
  if (!l) return;
  if (e.target.closest('[data-act="save"]')) toggleSave(l);
  else if (e.target.closest('[data-act="heard"]')) toggleHeard(l.id);
  else togglePlay(l);
});

/* ---------- player ---------- */
function togglePlay(l){
  if (state.playing === l.id) {
    if (audio.paused) requestPlay(); else requestPause();
    return;
  }
  play(l);
}

function play(l, options = {}){
  const autoplay = options.autoplay !== false;
  state.playing = l.id;
  pendingSeek = Math.max(0, options.position || 0);
  manualPause = !autoplay;
  resumeAfterInterruption = false;
  setPlaybackState(autoplay ? "loading" : "paused");
  audio.src = BASE + l.url;
  audio.playbackRate = state.rate;
  $("player").hidden = false;
  $("np-title").textContent = l.title;
  $("np-detail").textContent = fmtMeta(l) || "Lecture archive";
  $("np-save").innerHTML = state.saved.has(l.id) ? ICONS.check : ICONS.dl;
  $("np-save").classList.toggle("saved", state.saved.has(l.id));
  $("np-download").href = "/api/download?path=" + encodeURIComponent(l.url);
  updateMediaSession(l);
  if (autoplay) requestPlay();
  else {
    $("cur").textContent = fmtTime(pendingSeek);
    $("dur").textContent = l.length || "0:00";
  }
  render();
}

function requestPlay(){
  manualPause = false;
  resumeAfterInterruption = false;
  setPlaybackState("loading");
  audio.play().catch(() => {
    if (!audio.error) setPlaybackState("paused");
  });
}

function requestPause(){
  manualPause = true;
  resumeAfterInterruption = false;
  audio.pause();
}

function setPlaybackState(mode){
  const loading = mode === "loading" || mode === "buffering";
  state.loadingId = loading ? state.playing : null;
  $("player").classList.toggle("is-loading", loading);
  $("np-status").textContent = mode === "loading" ? "Loading audio…" :
    mode === "buffering" ? "Buffering…" :
    mode === "paused" ? "Paused" :
    mode === "error" ? "Playback unavailable" : "Now playing";
  $("play").classList.toggle("loading", loading);
  $("play").toggleAttribute("aria-busy", loading);
  $("play").innerHTML = loading ? '<span class="audio-loader" aria-hidden="true"></span>' :
    mode === "playing" ? ICONS.pause : ICONS.play;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = mode === "playing" ? "playing" :
      mode === "paused" ? "paused" : "none";
  }
  render();
}

function updateMediaSession(l){
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: l.title,
    artist: "H.H. Tamal Krishna Goswami",
    album: l.series || "TKGTM Lecture Archive",
    artwork: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}

function updateMediaPosition(){
  if (!("mediaSession" in navigator) || !audio.duration || !isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  } catch {}
}

function persistPlayback(force = false){
  if (!state.playing) return;
  const now = Date.now();
  if (!force && now - lastPlaybackSave < 5000) return;
  lastPlaybackSave = now;
  const l = state.all.find((x) => x.id === state.playing);
  if (!l) return;
  const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : secs(l.length);
  const position = Math.max(0, audio.currentTime || pendingSeek || 0);
  state.resume = { id: l.id, position, duration, rate: state.rate, updatedAt: now };
  localStorage.setItem(PLAYBACK_KEY, JSON.stringify(state.resume));
}

function fmtTime(s){
  if (!isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

audio.addEventListener("loadedmetadata", () => {
  $("dur").textContent = fmtTime(audio.duration);
  if (pendingSeek > 0 && pendingSeek < audio.duration - 5) {
    audio.currentTime = pendingSeek;
    $("cur").textContent = fmtTime(pendingSeek);
  }
  pendingSeek = 0;
  updateMediaPosition();
});
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  $("cur").textContent = fmtTime(audio.currentTime);
  $("seek").value = Math.round((audio.currentTime / audio.duration) * 1000);
  persistPlayback();
  updateMediaPosition();
  if (audio.currentTime / audio.duration >= .9 && state.playing && !state.heard.has(state.playing)) {
    state.heard.add(state.playing);
    persistHeard();
    render();
  }
});
audio.addEventListener("loadstart", () => setPlaybackState(manualPause && audio.paused ? "paused" : "loading"));
audio.addEventListener("waiting", () => { if (!audio.paused) setPlaybackState("buffering"); });
audio.addEventListener("stalled", () => { if (!audio.paused) setPlaybackState("buffering"); });
audio.addEventListener("playing", () => {
  resumeAfterInterruption = false;
  setPlaybackState("playing");
});
audio.addEventListener("canplay", () => {
  if (state.loadingId && audio.paused) setPlaybackState("paused");
});
audio.addEventListener("pause", () => {
  persistPlayback(true);
  if (!manualPause && !audio.ended && !state.loadingId) resumeAfterInterruption = true;
  if (!state.loadingId && !audio.ended) setPlaybackState("paused");
});
audio.addEventListener("ended", () => {
  if (state.playing) toggleHeard(state.playing, true);
  step(1);
});
audio.addEventListener("error", () => {
  setPlaybackState("error");
  if (!navigator.onLine && !state.saved.has(state.playing)) {
    toast("Not saved for offline \u2014 save it while online first.");
  }
});

$("prev").innerHTML = ICONS.prev;
$("next").innerHTML = ICONS.next;
$("np-download").innerHTML = ICONS.file;
$("play").innerHTML = ICONS.play;

$("play").addEventListener("click", () => {
  if (!state.playing) return;
  if (audio.paused) requestPlay(); else requestPause();
});
$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));
$("rewind").addEventListener("click", () => seekBy(-15));
$("forward").addEventListener("click", () => seekBy(15));
function seekBy(seconds){
  if (!isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  persistPlayback(true);
  updateMediaPosition();
}

function setupMediaSession(){
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: requestPlay,
    pause: requestPause,
    seekbackward: (details) => seekBy(-(details.seekOffset || 15)),
    seekforward: (details) => seekBy(details.seekOffset || 15),
    previoustrack: () => step(-1),
    nexttrack: () => step(1),
    seekto: (details) => {
      if (details.seekTime != null && isFinite(audio.duration)) {
        audio.currentTime = Math.max(0, Math.min(audio.duration, details.seekTime));
        persistPlayback(true);
      }
    },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  }
}
function step(dir){
  if (!state.list.length) return;
  let i = state.list.findIndex((l) => l.id === state.playing);
  if (i < 0) i = 0; else i = (i + dir + state.list.length) % state.list.length;
  play(state.list[i]);
}
$("rate").addEventListener("click", () => {
  const rates = [1, 1.25, 1.5, 2];
  const i = rates.indexOf(state.rate);
  state.rate = rates[(i + 1) % rates.length];
  audio.playbackRate = state.rate;
  $("rate").textContent = state.rate + "\u00d7";
  persistPlayback(true);
  updateMediaPosition();
});
$("seek").addEventListener("input", () => {
  if (audio.duration) audio.currentTime = (parseInt($("seek").value, 10) / 1000) * audio.duration;
});
$("np-save").addEventListener("click", () => {
  const l = state.all.find((x) => x.id === state.playing);
  if (l) toggleSave(l);
});

/* ---------- offline save (Cache API, no server state) ---------- */
async function toggleSave(l){
  const wasSaved = state.saved.has(l.id);
  const row = document.querySelector(`li[data-id="${l.id}"]`);
  let btn = row && row.querySelector(".save-btn");

  if (wasSaved) {
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(BASE + l.url);
    state.saved.delete(l.id);
    persistSaved();
  } else {
    setDownloadUI(l, { active: true, label: "0%", progress: 0 });
    try {
      await downloadWithRetry(l, (progress, label) => {
        setDownloadUI(l, { active: true, label, progress });
      });
      state.saved.add(l.id);
      persistSaved();
      toast("Saved for offline listening");
    } catch (err) {
      toast("Save failed after 3 attempts. Tap to retry.");
    }
    setDownloadUI(l, { active: false });
    btn = document.querySelector(`li[data-id="${l.id}"] .save-btn`);
  }

  const saved = state.saved.has(l.id);
  if (btn) {
    btn.classList.toggle("saved", saved);
    btn.innerHTML = saved ? ICONS.check : ICONS.dl;
    btn.setAttribute("aria-label", saved ? "Remove from offline" : "Save offline");
  }
  if (state.playing === l.id) {
    $("np-save").innerHTML = saved ? ICONS.check : ICONS.dl;
    $("np-save").classList.toggle("saved", saved);
  }
  if (state.playing === l.id) setPlaybackState(audio.paused ? "paused" : "playing");
  else render();
}

function setDownloadUI(l, { active, label = "", progress = 0 }){
  const rowBtn = document.querySelector(`li[data-id="${l.id}"] .save-btn`);
  const buttons = [rowBtn, state.playing === l.id ? $("np-save") : null].filter(Boolean);
  for (const button of buttons) {
    button.classList.toggle("saving", active);
    button.disabled = active;
    button.toggleAttribute("aria-busy", active);
    if (active) {
      button.textContent = label;
      button.setAttribute("aria-label", label.startsWith("Retry") ? label : `Saving offline ${label}`);
      button.setAttribute("aria-valuenow", String(Math.round(progress)));
    } else {
      button.removeAttribute("aria-valuenow");
    }
  }
  if (active && state.playing === l.id) $("np-status").textContent = `Saving offline \u00b7 ${label}`;
}

async function downloadWithRetry(l, onProgress){
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) onProgress(0, `Retry ${attempt}/3`);
      return await downloadLecture(l, onProgress);
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }
  throw lastError;
}

async function downloadLecture(l, onProgress){
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  const cache = await caches.open(AUDIO_CACHE);
  const cacheKey = BASE + l.url;
  try {
    const response = await fetch("/api/download?path=" + encodeURIComponent(l.url), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error(`download ${response.status}`);
    const total = parseInt(response.headers.get("content-length") || "0", 10);
    let received = 0;
    const report = (byteLength) => {
      received += byteLength;
      if (total > 0) {
        const progress = Math.min(99, (received / total) * 100);
        onProgress(progress, `${Math.round(progress)}%`);
      } else {
        onProgress(0, `${(received / 1048576).toFixed(1)} MB`);
      }
    };

    if ("TransformStream" in window) {
      const tracked = response.body.pipeThrough(new TransformStream({
        transform(chunk, streamController){
          report(chunk.byteLength);
          streamController.enqueue(chunk);
        },
      }));
      await cache.put(cacheKey, new Response(tracked, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", ...(total ? { "Content-Length": String(total) } : {}) },
      }));
    } else {
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        report(value.byteLength);
      }
      const blob = new Blob(chunks, { type: "audio/mpeg" });
      await cache.put(cacheKey, new Response(blob, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) },
      }));
    }
    if (total > 0 && received < total) throw new Error("incomplete download");
    onProgress(100, "100%");
    return true;
  } catch (err) {
    await cache.delete(cacheKey);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function persistSaved(){
  localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved]));
}

function toggleHeard(id, forceHeard = false){
  if (forceHeard || !state.heard.has(id)) state.heard.add(id);
  else state.heard.delete(id);
  persistHeard();
  render();
}

function persistHeard(){
  localStorage.setItem(HEARD_KEY, JSON.stringify([...state.heard]));
}

/* ---------- filters ---------- */
$("q").addEventListener("input", (e) => { state.q = e.target.value; state.visible = 200; render(); });
$("series").addEventListener("change", (e) => { state.series = e.target.value; state.visible = 200; render(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; state.visible = 200; render(); });
$("offline-filter").addEventListener("click", () => {
  state.savedOnly = !state.savedOnly;
  $("offline-filter").setAttribute("aria-pressed", String(state.savedOnly));
  state.visible = 200;
  render();
});
$("heard-filter").addEventListener("click", () => {
  state.heardOnly = !state.heardOnly;
  $("heard-filter").setAttribute("aria-pressed", String(state.heardOnly));
  state.visible = 200;
  render();
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("q").focus();
  }
});

/* ---------- toast ---------- */
let toastEl;
function toast(msg){
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.style.cssText = "position:fixed;bottom:140px;left:50%;transform:translateX(-50%);" +
      "background:var(--ink);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;" +
      "z-index:99;white-space:nowrap;transition:opacity .3s";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.opacity = "1";
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.style.opacity = "0"; }, 2600);
}

/* ---------- install ---------- */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  $("install-btn").hidden = false;
});
$("install-btn").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $("install-btn").hidden = true;
});

/* ---------- online/offline ---------- */
window.addEventListener("online", () => toast("Back online"));
window.addEventListener("offline", () => toast("Offline \u2014 saved lectures still play"));

function tryResumeAfterInterruption(){
  if (!resumeAfterInterruption || manualPause || !state.playing || !audio.paused) return;
  resumeAfterInterruption = false;
  audio.play().catch(() => {
    setPlaybackState("paused");
    toast("Playback was interrupted. Tap play to continue.");
  });
}
document.addEventListener("visibilitychange", () => {
  persistPlayback(true);
  if (document.visibilityState === "visible") setTimeout(tryResumeAfterInterruption, 350);
});
window.addEventListener("pageshow", () => setTimeout(tryResumeAfterInterruption, 350));
window.addEventListener("focus", () => setTimeout(tryResumeAfterInterruption, 350));
window.addEventListener("pagehide", () => persistPlayback(true));

/* ---------- boot ---------- */
async function reconcileSaved(){
  if (!state.saved.size) return;
  const cache = await caches.open(AUDIO_CACHE);
  let changed = false;
  for (const id of [...state.saved]) {
    const l = state.all.find((x) => x.id === id);
    if (!l) { state.saved.delete(id); changed = true; continue; }
    const hit = await cache.match(BASE + l.url);
    if (!hit) { state.saved.delete(id); changed = true; }
  }
  if (changed) { persistSaved(); render(); }
}

(async function boot(){
  try { state.saved = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")); } catch {}
  try { state.heard = new Set(JSON.parse(localStorage.getItem(HEARD_KEY) || "[]")); } catch {}
  try { state.resume = JSON.parse(localStorage.getItem(PLAYBACK_KEY) || "null"); } catch {}
  try {
    const r = await fetch("/lectures.json", { cache: "no-cache" });
    state.all = await r.json();
  } catch (e) {
    $("empty").hidden = false;
    $("empty-text").textContent = "Couldn\u2019t load the lecture list. Check your connection.";
    return;
  }
  buildYears();
  buildSeries();
  render();
  reconcileSaved();
  setupMediaSession();

  if (state.resume && state.resume.position > 5) {
    const l = state.all.find((x) => x.id === state.resume.id);
    if (l) {
      state.rate = [1, 1.25, 1.5, 2].includes(state.resume.rate) ? state.resume.rate : 1;
      $("rate").textContent = state.rate + "\u00d7";
      play(l, { autoplay: false, position: state.resume.position });
      $("np-status").textContent = `Continue from ${fmtTime(state.resume.position)}`;
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
