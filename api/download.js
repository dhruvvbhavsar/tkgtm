// Vercel serverless function: proxy a lecture download so the browser saves
// an actual .mp3 file (with Content-Disposition: attachment). Stateless.
import { Readable } from "node:stream";

export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export default async function handler(req, res) {
  const path = (req.query.path || "").toString();

  // strict whitelist: only allow tkgtm audio paths
  if (!/^\/MP3audio\/MP3_[\w-]+\/[\w.,%&'()!\-]+\.mp3$/.test(path)) {
    res.status(400).end("invalid path");
    return;
  }

  const url = "https://www.tkgtm.com" + path;
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "audio/*,*/*;q=0.8",
        Referer: "https://www.tkgtm.com/listen/listen_all_MP3.htm",
      },
    });
  } catch (e) {
    res.status(502).end("upstream fetch failed");
    return;
  }

  if (!upstream.ok) {
    res.status(502).end("upstream " + upstream.status);
    return;
  }

  const filename = decodeURIComponent(path.split("/").pop());
  res.status(200);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[\\"]/g, "_")}"`
  );
  const len = upstream.headers.get("content-length");
  if (len) res.setHeader("Content-Length", len);

  Readable.fromWeb(upstream.body).pipe(res);
}
