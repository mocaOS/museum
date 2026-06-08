/**
 * Bulk-import users from an .xlsx file into the cortex-chat admin API.
 *
 * Usage:
 *   bun run import-users                       # dry-run (default)
 *   bun run import-users --apply               # actually create users
 *
 * All config comes from env vars (see scripts/.env.example) or matching CLI flags:
 *   IMPORT_ADMIN_EMAIL / IMPORT_ADMIN_PASSWORD   superadmin login (required)
 *   IMPORT_URL                                   target instance, e.g. https://chat.example.com (required)
 *   IMPORT_FILE                                  xlsx path (required)
 *   IMPORT_GROUP                                 group name to assign (required)
 *   IMPORT_DEFAULT_PASSWORD                      password assigned to every new user (required)
 * CLI flags (--url, --file, --group, --password, --admin-email, --admin-password) override env.
 *
 * Recommended invocation loads scripts/.env automatically:
 *   bun run import-users               # dry-run
 *   bun run import-users --apply
 */

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import * as XLSX from "xlsx";

// Cookie name set by the cortex-chat server on successful login — internal protocol detail, not user config.
const SESSION_COOKIE = "cortex_session";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    apply: { type: "boolean", default: false },
    file: { type: "string" },
    url: { type: "string" },
    group: { type: "string" },
    password: { type: "string" },
    "admin-email": { type: "string" },
    "admin-password": { type: "string" },
    help: { type: "boolean", default: false, short: "h" },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`Bulk-import users into the cortex-chat live deployment.

Usage:
  bun run import-users                          # dry-run (default)
  bun run import-users --apply                  # actually creates users

All values come from scripts/.env (loaded automatically via --env-file in
package.json) or the matching CLI flag.

Flags (CLI overrides env, all required unless they have a default in env):
  --apply              commit changes (default: dry-run)
  --url=<base>         API base URL (env IMPORT_URL)
  --file=<path>        xlsx file (env IMPORT_FILE)
  --group=<name>       group to assign (env IMPORT_GROUP)
  --password=<pw>      password for new users (env IMPORT_DEFAULT_PASSWORD)
  --admin-email=<x>    superadmin email (env IMPORT_ADMIN_EMAIL)
  --admin-password=<x> superadmin password (env IMPORT_ADMIN_PASSWORD)
  -h, --help           show this message`);
  process.exit(0);
}

const APPLY = values.apply === true;
const BASE_URL_RAW = values.url ?? process.env.IMPORT_URL;
const FILE_PATH = values.file ?? process.env.IMPORT_FILE;
const GROUP_NAME = values.group ?? process.env.IMPORT_GROUP;
const NEW_USER_PASSWORD =
  values.password ?? process.env.IMPORT_DEFAULT_PASSWORD;
const ADMIN_EMAIL = values["admin-email"] ?? process.env.IMPORT_ADMIN_EMAIL;
const ADMIN_PASSWORD =
  values["admin-password"] ?? process.env.IMPORT_ADMIN_PASSWORD;

const missing: string[] = [];
if (!BASE_URL_RAW) missing.push("IMPORT_URL (or --url)");
if (!FILE_PATH) missing.push("IMPORT_FILE (or --file)");
if (!GROUP_NAME) missing.push("IMPORT_GROUP (or --group)");
if (!NEW_USER_PASSWORD) missing.push("IMPORT_DEFAULT_PASSWORD (or --password)");
if (!ADMIN_EMAIL) missing.push("IMPORT_ADMIN_EMAIL (or --admin-email)");
if (!ADMIN_PASSWORD) missing.push("IMPORT_ADMIN_PASSWORD (or --admin-password)");

if (missing.length > 0) {
  console.error(
    `ERROR: missing required config:\n  - ${missing.join("\n  - ")}\n\n` +
      `Copy scripts/.env.example to scripts/.env and fill it in, or pass the values as CLI flags.`
  );
  process.exit(1);
}

const BASE_URL = BASE_URL_RAW!.replace(/\/$/, "");

if (!existsSync(FILE_PATH!)) {
  console.error(`ERROR: xlsx file not found: ${FILE_PATH}`);
  process.exit(1);
}

console.log(APPLY ? "MODE: --apply (writes WILL happen)" : "MODE: dry-run (no writes)");
console.log(`  url:      ${BASE_URL}`);
console.log(`  file:     ${FILE_PATH}`);
console.log(`  group:    ${GROUP_NAME}`);
console.log(`  password: ${NEW_USER_PASSWORD}`);
console.log("");

// ── Login ────────────────────────────────────────────────────────────────
const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});
if (!loginRes.ok) {
  const txt = await loginRes.text().catch(() => "");
  console.error(`Login failed (${loginRes.status}): ${txt}`);
  process.exit(1);
}

const setCookies = loginRes.headers.getSetCookie?.() ?? [];
const sessionCookie = setCookies
  .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  ?.split(";")[0];
if (!sessionCookie) {
  console.error(
    `Login succeeded but no ${SESSION_COOKIE} cookie was returned. Headers: ${JSON.stringify(
      [...loginRes.headers.entries()]
    )}`
  );
  process.exit(1);
}
const loginJson = (await loginRes.json().catch(() => ({}))) as {
  role?: string;
  email?: string;
};
console.log(`logged in as ${loginJson.email ?? ADMIN_EMAIL} (${loginJson.role ?? "?"})`);

const authHeaders: Record<string, string> = {
  Cookie: sessionCookie,
  "Content-Type": "application/json",
};

// ── Resolve group ────────────────────────────────────────────────────────
const groupsRes = await fetch(`${BASE_URL}/api/admin/groups`, { headers: authHeaders });
if (!groupsRes.ok) {
  console.error(`Failed to fetch groups (${groupsRes.status})`);
  process.exit(1);
}
const groupsBody = (await groupsRes.json()) as {
  groups?: Array<{ id: string; name: string }>;
};
const targetGroup = (groupsBody.groups ?? []).find((g) => g.name === GROUP_NAME);
if (!targetGroup) {
  const available = (groupsBody.groups ?? []).map((g) => g.name).join(", ") || "(none)";
  console.error(
    `ERROR: group "${GROUP_NAME}" not found on ${BASE_URL}.\n` +
      `Available groups: ${available}\n` +
      `Create the group via the admin UI first, then re-run.`
  );
  process.exit(1);
}
console.log(`resolved group ${GROUP_NAME} → ${targetGroup.id}`);

// ── Pre-fetch existing users ─────────────────────────────────────────────
const usersRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
if (!usersRes.ok) {
  console.error(`Failed to fetch existing users (${usersRes.status})`);
  process.exit(1);
}
const usersBody = (await usersRes.json()) as {
  users?: Array<{ email: string }>;
};
const existingEmails = new Set<string>(
  (usersBody.users ?? []).map((u) => u.email.toLowerCase())
);
console.log(`fetched ${existingEmails.size} existing user(s) on the live DB`);

// ── Parse xlsx ───────────────────────────────────────────────────────────
const wb = XLSX.readFile(FILE_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
  defval: "",
});
console.log(`parsed ${rawRows.length} row(s) from ${FILE_PATH}\n`);

interface Candidate {
  email: string;
  username: string;
  rowNum: number; // 1-based, header is row 1, first data row is row 2
}

const seenInFile = new Set<string>();
const candidates: Candidate[] = [];
let invalid = 0;

rawRows.forEach((row, idx) => {
  const rowNum = idx + 2;
  const email = String(row.email ?? "").trim().toLowerCase();
  const username = String(row.benutzername ?? "").trim();

  if (!email || !email.includes("@")) {
    invalid++;
    console.log(`[skip] row ${rowNum}: invalid email "${row.email ?? ""}"`);
    return;
  }
  if (!username) {
    invalid++;
    console.log(`[skip] row ${rowNum}: missing benutzername`);
    return;
  }
  if (seenInFile.has(email)) {
    console.log(`[skip] row ${rowNum}: duplicate email in file (${email})`);
    return;
  }
  seenInFile.add(email);
  candidates.push({ email, username, rowNum });
});

// ── Dry-run or apply ─────────────────────────────────────────────────────
let toCreate = 0;
let alreadyExists = 0;
let created = 0;
let failed = 0;

for (const c of candidates) {
  if (existingEmails.has(c.email)) {
    alreadyExists++;
    console.log(`[skip] already exists: ${c.email}`);
    continue;
  }

  if (!APPLY) {
    toCreate++;
    console.log(`[DRY]  would create email=${c.email} username=${c.username}`);
    continue;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        email: c.email,
        password: NEW_USER_PASSWORD,
        username: c.username,
        role: "user",
        groupId: targetGroup.id,
      }),
    });
    if (res.ok) {
      created++;
      console.log(`[ok]   created ${c.email}`);
    } else {
      failed++;
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) detail = `HTTP ${res.status}: ${j.error}`;
      } catch {
        // ignore JSON parse failure
      }
      console.log(`[fail] ${c.email}: ${detail}`);
    }
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[fail] ${c.email}: network error ${msg}`);
  }
}

console.log("");
if (APPLY) {
  console.log(
    `DONE: created ${created} · skipped ${alreadyExists} (already exist) · invalid ${invalid} · failed ${failed}`
  );
  process.exit(failed > 0 ? 2 : 0);
} else {
  console.log(
    `DRY-RUN: would create ${toCreate} · skip ${alreadyExists} (already exist) · invalid ${invalid}`
  );
  console.log("Re-run with --apply to actually create the users.");
}
