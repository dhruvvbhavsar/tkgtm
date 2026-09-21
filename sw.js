"use strict";

const VERSION = "v16";
const SHELL_CACHE = "tkgtm-shell-" + VERSION;
const AUDIO_CACHE = "tkgtm-audio-v1";

const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/views.js",
  "/manifest.webmanifest",
  "/lectures.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith("tkgtm-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Cross-origin audio: cache-first (offline playback), else network.
  if (url.hostname === "www.tkgtm.com" && url.pathname.startsWith("/MP3audio/")) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((cache) =>
        cache.match(e.request).then((hit) => {
          if (hit) return hit;
          return fetch(e.request).catch(() =>
            new Response("offline", { status: 504, statusText: "offline" })
          );
        })
      )
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // lecture list: network-first so updates flow, fall back to cache.
  if (url.pathname === "/lectures.json") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // navigation: app shell offline fallback.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/"))
    );
    return;
  }

  // other same-origin assets: cache-first + background refresh.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetchPromise = fetch(e.request)
        .then((r) => {
          if (r && r.ok) {
            const clone = r.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
