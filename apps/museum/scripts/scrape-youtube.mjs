#!/usr/bin/env node
// Refreshes the MOCA video content pulled from YouTube:
//   • src/content/moca-live.json   — the channel's livestreams (/streams tab)
//   • src/content/press-room.json  — `artistInterviews` (the /videos tab uploads)
//
// We scrape YouTube's public web payload directly (no API key, no deps):
//   1. GET the channel tab HTML with a desktop UA + `CONSENT=YES+1` cookie
//      (skips the EU consent interstitial that otherwise returns an empty body).
//   2. Pull the first page of items out of the inlined `var ytInitialData = {…}`.
//   3. Page the rest through the InnerTube endpoint
//      POST https://www.youtube.com/youtubei/v1/browse  using the
//      INNERTUBE_API_KEY + client version + the `continuationCommand.token`
//      found in the page, looping until no new items come back.
//   4. Items live in `lockupViewModel` (current layout) or `videoRenderer`
//      (older layout) nodes — we walk the tree and read id + title from both.
//   5. For livestreams we also fetch each watch page and read
//      `"uploadDate":"YYYY-MM-DD"` from the microformat so they can be dated
//      and sorted. (The /videos uploads keep YouTube's newest-first order.)
//
// YouTube changes these shapes occasionally; if a run returns 0 items, the
// regexes / node keys below are the first thing to check.
//
// Usage (from apps/museum):
//   node scripts/scrape-youtube.mjs            # refresh both
//   node scripts/scrape-youtube.mjs streams    # only moca-live.json
//   node scripts/scrape-youtube.mjs videos     # only press-room artistInterviews

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HANDLE = "@museumofcryptoartmc6354";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTab(tab) {
  const res = await fetch(`https://www.youtube.com/${HANDLE}/${tab}`, { headers: HEADERS });
  return res.text();
}

function parseInitialData(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error("ytInitialData not found — page shape changed?");
  return JSON.parse(m[1]);
}

function meta(html) {
  return {
    key: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1],
    ver: html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1],
  };
}

// Walk the response tree collecting [id, title] from both node shapes.
function collect(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, out);
  } else if (node && typeof node === "object") {
    const lv = node.lockupViewModel;
    if (lv?.contentId) {
      const title = lv.metadata?.lockupMetadataViewModel?.title?.content;
      if (title) out.push([lv.contentId, title]);
    }
    const vr = node.videoRenderer;
    if (vr?.videoId) {
      const t = vr.title;
      const title = (t?.runs?.map((r) => r.text).join("") || t?.simpleText || "").trim();
      if (title) out.push([vr.videoId, title]);
    }
    for (const v of Object.values(node)) collect(v, out);
  }
}

function findToken(node) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findToken(v);
      if (r) return r;
    }
  } else if (node && typeof node === "object") {
    if (node.continuationCommand?.token) return node.continuationCommand.token;
    for (const v of Object.values(node)) {
      const r = findToken(v);
      if (r) return r;
    }
  }
  return null;
}

// Scrape a channel tab to a de-duped, ordered list of { id, title } (newest first).
async function scrapeTab(tab) {
  const html = await getTab(tab);
  const { key, ver } = meta(html);
  const data = parseInitialData(html);

  const seen = new Set();
  const items = [];
  const push = (pairs) => {
    for (const [id, title] of pairs) {
      if (!seen.has(id)) {
        seen.add(id);
        items.push({ id, title });
      }
    }
  };

  const first = [];
  collect(data, first);
  push(first);
  let token = findToken(data);

  while (token) {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: ver, hl: "en", gl: "US" } },
        continuation: token,
      }),
    });
    const json = await res.json();
    const page = [];
    collect(json, page);
    const before = items.length;
    push(page);
    if (items.length === before) break; // no new items
    token = findToken(json);
  }
  return items;
}

async function uploadDate(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: HEADERS });
    const html = await res.text();
    return html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function refreshStreams() {
  const file = join(ROOT, "src/content/moca-live.json");
  const json = JSON.parse(readFileSync(file, "utf8"));
  const items = await scrapeTab("streams");
  console.log(`streams: ${items.length} found — fetching dates…`);
  const streams = [];
  for (const it of items) {
    const date = await uploadDate(it.id);
    streams.push({ id: it.id, title: it.title, date });
    await sleep(50);
  }
  json.streams = streams; // keep intro + spotify
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote ${streams.length} streams → moca-live.json`);
  return new Set(items.map((i) => i.id));
}

async function refreshVideos(streamIds) {
  const file = join(ROOT, "src/content/press-room.json");
  const json = JSON.parse(readFileSync(file, "utf8"));
  const ids = streamIds ?? new Set((await scrapeTab("streams")).map((i) => i.id));
  const videos = await scrapeTab("videos");
  // Uploads only — drop anything that is actually a livestream (lives on MOCA Live).
  json.artistInterviews = videos
    .filter((v) => !ids.has(v.id))
    .map((v) => ({ id: v.id, title: v.title.replace(/\s+/g, " ").trim() }));
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote ${json.artistInterviews.length} artist interviews → press-room.json`);
}

const mode = process.argv[2] ?? "all";
if (mode === "streams") await refreshStreams();
else if (mode === "videos") await refreshVideos();
else {
  const ids = await refreshStreams();
  await refreshVideos(ids);
}
