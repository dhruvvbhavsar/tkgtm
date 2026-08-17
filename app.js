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
};

const AUDIO_CACHE = "tkgtm-audio-v1";
const SAVED_KEY = "tkgtm.saved.v1";
const BASE = "https://www.tkgtm.com";

const state = {
  q: "", year: "", series: "", sort: "year", savedOnly: false,
  playing: null, list: [], all: [], saved: new Set(),
  visible: 200, rate: 1, loadingId: null,
};
const audio = $("audio");
let deferredInstall = null;

/* ---------- data ---------- */
function yearValue(y){ return y === "Unknown" ? null : parseInt(y, 10); }

function filterList(){
  let out = state.all;
  if (state.year) out = out.filter((d) => d.year === state.year);
  if (state.series) out = out.filter((d) => d.series === state.series);
  if (state.savedOnly) out = out.filter((d) => state.saved.has(d.id));
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
  return `<li data-id="${l.id}">
    <div class="episode-no" aria-hidden="true">${String(state.list.indexOf(l) + 1).padStart(2, "0")}</div>
    <button class="play-btn${playing ? " playing" : ""}${loading ? " loading" : ""}" data-act="play" aria-label="${loading ? "Loading audio" : playing ? "Pause" : "Play"}" ${loading ? 'aria-busy="true"' : ""}>${loading ? '<span class="audio-loader" aria-hidden="true"></span>' : playing ? ICONS.pause : ICONS.play}</button>
    <div class="row-body" data-act="play">
      <div class="row-title">${esc(l.title)}</div>
      <div class="row-meta">${rowMeta(l)}</div>
    </div>
    <button class="save-btn${saved ? " saved" : ""}" data-act="save" aria-label="${saved ? "Remove from offline" : "Save offline"}">${saved ? ICONS.check : ICONS.dl}</button>
  </li>`;
}

function render(){
  state.list = filterList();
  $("count").textContent =
    `${state.list.length} lecture${state.list.length === 1 ? "" : "s"}` +
    (state.savedOnly ? " \u00b7 saved" : "") +
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
  else togglePlay(l);
});

/* ---------- player ---------- */
function togglePlay(l){
  if (state.playing === l.id) {
    if (audio.paused) audio.play(); else audio.pause();
    return;
  }
  play(l);
}

function play(l){
  state.playing = l.id;
  setPlaybackState("loading");
  audio.src = BASE + l.url;
  audio.playbackRate = state.rate;
  $("player").hidden = false;
  $("np-title").textContent = l.title;
  $("np-detail").textContent = fmtMeta(l) || "Lecture archive";
  $("np-save").innerHTML = state.saved.has(l.id) ? ICONS.check : ICONS.dl;
  $("np-save").classList.toggle("saved", state.saved.has(l.id));
  $("np-download").href = "/api/download?path=" + encodeURIComponent(l.url);
  audio.play().catch(() => {
    if (state.playing === l.id && !audio.error) setPlaybackState("paused");
  });
  render();
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
  render();
}

function fmtTime(s){
  if (!isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

audio.addEventListener("loadedmetadata", () => { $("dur").textContent = fmtTime(audio.duration); });
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  $("cur").textContent = fmtTime(audio.currentTime);
  $("seek").value = Math.round((audio.currentTime / audio.duration) * 1000);
});
audio.addEventListener("loadstart", () => setPlaybackState("loading"));
audio.addEventListener("waiting", () => { if (!audio.paused) setPlaybackState("buffering"); });
audio.addEventListener("stalled", () => { if (!audio.paused) setPlaybackState("buffering"); });
audio.addEventListener("playing", () => setPlaybackState("playing"));
audio.addEventListener("canplay", () => {
  if (state.loadingId && audio.paused) setPlaybackState("paused");
});
audio.addEventListener("pause", () => {
  if (!state.loadingId && !audio.ended) setPlaybackState("paused");
});
audio.addEventListener("ended", () => step(1));
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
  if (audio.paused) audio.play(); else audio.pause();
});
$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));
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
  const btn = row && row.querySelector(".save-btn");

  if (wasSaved) {
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(BASE + l.url);
    state.saved.delete(l.id);
    persistSaved();
  } else {
    if (btn) { btn.classList.add("saving"); btn.innerHTML = ICONS.dl; btn.disabled = true; }
    try {
      const url = BASE + l.url;
      const cache = await caches.open(AUDIO_CACHE);
      const resp = await fetch(url, { mode: "no-cors" });
      await cache.put(url, resp);
      state.saved.add(l.id);
      persistSaved();
    } catch (err) {
      toast("Couldn\u2019t save \u2014 check connection.");
    }
    if (btn) { btn.classList.remove("saving"); btn.disabled = false; }
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
  if (state.savedOnly) render();
  else {
    const n = state.list.length;
    $("count").textContent =
      `${n} lecture${n === 1 ? "" : "s"}` + (state.saved.size ? ` \u00b7 ${state.saved.size} offline` : "");
  }
}

function persistSaved(){
  localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved]));
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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
