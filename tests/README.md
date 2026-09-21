# Redesign verification

The app remains dependency-free at runtime. Browser tests use Node's built-in test runner and Playwright driving installed Google Chrome. Install Playwright outside the repository or make it available through your normal Node module resolution; set `PLAYWRIGHT_PATH` to its absolute module directory if needed.

```sh
# Terminal 1: ordinary shell server for UI tests
python3 -m http.server 8765
# Terminal 2: actual app server, including download proxy
python3 -B app.py 8766
# Terminal 3
PLAYWRIGHT_PATH=/absolute/path/to/node_modules/playwright node --test tests/redesign.cjs tests/live-audio.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
```

`redesign.cjs` covers real dataset collection links, browser Back, URL filter restoration, mobile overflow, favourites persistence/separation, accessible row focus, heard controls, native dialog closure/focus, and legacy-to-per-lecture progress migration.

`series-search.cjs` covers the series page (verse-ordered 01–N, Invocation first, progress text, play-all queue, continue-to-first-unheard) and grouped search (verse matches under their own heading, series hits linking to series pages).

`live-audio.cjs` is a network integration test, not mocked audio. It streams archive lecture 2940, exercises pause/skip/speed, downloads the actual MP3 through the Python proxy, checks the Cache API response, reloads offline, resumes cached audio and removes the download. It requires access to www.tkgtm.com and may fail when the archive is unavailable. `TEST_URL` changes its default server address.

The Python test starts its own ephemeral server and verifies the new view script is served by the existing app server.

Architecture: `app.js` owns audio, persistence, archive filtering and downloads. `views.js` owns hash routing, editorial series cards, continuation cards and the native Now Playing dialog. Existing player nodes are moved into/out of the dialog, preserving one audio element and one set of playback event handlers. No framework, bundler or remote visual assets were added. Artwork is intentionally abstract CSS, not archival photography. All original lecture titles are retained.

Deferred: editable queue, bookmarks, sleep timer, device-level interruption testing on physical iOS/Android. Previous/next use a snapshot of the originating lecture list, so browsing elsewhere does not silently change the sequence.
