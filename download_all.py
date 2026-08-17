#!/usr/bin/env python3
"""Bulk download all TKGTM lectures (for when your external drive is attached).

Resumable, skips already-downloaded files, and throttles politely.
Reads the same lectures.json produced by the player app.

Usage:
    python3 download_all.py /Volumes/MyDrive/tkgtm
    python3 download_all.py /Volumes/MyDrive/tkgtm --year 1996
    python3 download_all.py /Volumes/MyDrive/tkgtm --delay 1.0 --jobs 4
    python3 download_all.py /Volumes/MyDrive/tkgtm --dry-run
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import re
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(HERE, "lectures.json")

SRC_HOST = "https://www.tkgtm.com"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
ACCEPT = "audio/*,*/*;q=0.8"
CHUNK = 256 * 1024


def local_filename(url):
    name = url.rsplit("/", 1)[-1]
    name = re.sub(r'[\\/:*?"<>|]+', "_", name)
    return name


def fetch(url, start=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": ACCEPT,
        "Referer": "https://www.tkgtm.com/listen/listen_all_MP3.htm",
    })
    if start:
        req.add_header("Range", "bytes=%d-" % start)
    return urllib.request.urlopen(req, timeout=120)


def download_one(item, target_dir, resume=True):
    url = SRC_HOST + item["url"]
    name = local_filename(item["url"])
    year = item["year"] if item["year"] else "Unknown"
    out_dir = os.path.join(target_dir, "MP3_" + str(year))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    part = path + ".part"

    start = 0
    if resume and os.path.exists(part):
        start = os.path.getsize(part)
    if os.path.exists(path):
        return "skip", path, os.path.getsize(path)

    try:
        resp = fetch(url, start if start else None)
    except urllib.error.HTTPError as e:
        return "error", path, "%s" % e

    status = resp.getcode()
    mode = "ab" if start else "wb"
    total = 0
    try:
        with open(part, mode) as f:
            while True:
                data = resp.read(CHUNK)
                if not data:
                    break
                f.write(data)
                total += len(data)
    finally:
        resp.close()

    os.replace(part, path)
    return "ok", path, start + total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dest", nargs="?", default="./tkgtm_downloads",
                    help="destination directory (e.g. /Volumes/MyDrive/tkgtm)")
    ap.add_argument("--year", help="only download one year (e.g. 1996)")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--delay", type=float, default=0.5,
                    help="seconds to sleep between starting downloads")
    ap.add_argument("--no-resume", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(DATA_FILE, encoding="utf-8") as f:
        lectures = json.load(f)

    if args.year:
        lectures = [l for l in lectures if str(l["year"]) == str(args.year)]

    total_bytes = 0
    done = 0
    errors = []

    print("Total files: %d" % len(lectures))
    print("Destination: %s" % os.path.abspath(args.dest))

    def handle(item):
        nonlocal done, total_bytes
        if args.dry_run:
            print("would download: %s" % SRC_HOST + item["url"])
            return
        status, path, size = download_one(item, args.dest, resume=not args.no_resume)
        done += 1
        if status == "ok":
            total_bytes += size
            print("[%d/%d] ok  %s (%d bytes)"
                  % (done, len(lectures), os.path.basename(path), size))
        elif status == "skip":
            print("[%d/%d] skip %s" % (done, len(lectures), os.path.basename(path)))
        else:
            errors.append((path, size))
            print("[%d/%d] ERROR %s: %s" % (done, len(lectures), os.path.basename(path), size))

    if args.jobs and args.jobs > 1 and not args.dry_run:
        with ThreadPoolExecutor(max_workers=args.jobs) as ex:
            for item in lectures:
                ex.submit(handle, item)
                if args.delay:
                    time.sleep(args.delay)
            ex.shutdown(wait=True)
    else:
        for item in lectures:
            handle(item)
            if args.delay and not args.dry_run:
                time.sleep(args.delay)

    print("\nDone. Downloaded: %.2f MB" % (total_bytes / 1024 / 1024))
    if errors:
        print("Errors: %d" % len(errors))
        for p, e in errors[:20]:
            print("  - %s: %s" % (os.path.basename(p), e))


if __name__ == "__main__":
    main()
