# scripts/

One-off operational scripts for cortex-chat deployments.

## import-users

Bulk-create users on a running cortex-chat instance from an xlsx file. Talks to the same `/api/admin/*` endpoints the superadmin UI uses.

> **Which "instance"?** In this repo, "cortex-chat" means *this* Next.js wrapper app — the one serving the chat UI, the login page, and the `/api/admin/*` superadmin routes. It is **not** the upstream Cortex backend (a separate service / repo, typically referred to as `cortex-app` and reachable via `CORTEX_API_URL`, often a different host or port like `http://localhost:8000`).
>
> Users live in this app's own SQLite DB, not in the Cortex backend. The script never touches the Cortex backend — it only talks to cortex-chat's auth and admin routes. `IMPORT_URL` must therefore be the cortex-chat host, not the Cortex backend host.

### What it does

1. Logs in to the target deployment with the configured superadmin credentials (`POST /api/auth/login`) and reuses the `cortex_session` cookie.
2. Resolves the target group by name (`GET /api/admin/groups`). Aborts if the group does not exist — create it via the admin UI first.
3. Pre-fetches the current user list (`GET /api/admin/users`) so re-runs are idempotent.
4. Parses the xlsx (first sheet) and validates each row.
5. For every row whose email is not already a user, either logs `[DRY] would create …` (dry-run) or issues `POST /api/admin/users` with role `user`, the resolved `groupId`, and the shared default password.

**Existing users are never modified.** If an email already exists on the target, it is skipped — no password reset, no group reassignment, no username change.

### xlsx format

- First sheet of the workbook.
- Header row required.
- Two columns, headers **must be lowercase**: `email`, `benutzername`.
- Other columns are ignored.

Rows are skipped (with a `[skip] row N: …` log line) when:
- email is empty or missing `@`
- benutzername is empty
- the same email already appeared earlier in the same file

### Setup

1. Install dependencies (needed for the `xlsx` package):
   ```bash
   bun install
   ```
2. Copy the env template and fill it in:
   ```bash
   cp scripts/.env.example scripts/.env
   ```
   Required values: `IMPORT_ADMIN_EMAIL`, `IMPORT_ADMIN_PASSWORD`, `IMPORT_URL`, `IMPORT_FILE`, `IMPORT_GROUP`, `IMPORT_DEFAULT_PASSWORD`. See `.env.example` for what each one means.

   **`IMPORT_URL` is the cortex-chat frontend URL** — the one you open in a browser to reach the chat login page (e.g. `https://chat.example.com` in production, or `http://localhost:3001` if cortex-chat is running locally on port 3001). It is **not** the Cortex backend API URL (`CORTEX_API_URL`, often `http://localhost:8000`). Pointing it at the backend will fail with HTTP 404 because the Cortex backend has no `/api/auth/login` route. Quick smoke-test: open `IMPORT_URL` in a browser — you should see the cortex-chat login page, not a Cortex backend Swagger / OpenAPI / JSON response.

   Likewise, `IMPORT_ADMIN_EMAIL` and `IMPORT_ADMIN_PASSWORD` must match the **cortex-chat** superadmin (the `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` env vars set on the cortex-chat deployment — visible in Coolify under the cortex-chat service's Environment Variables). They have nothing to do with the Cortex backend's admin API key.

   `scripts/.env` is gitignored — never commit it.

3. The xlsx file referenced by `IMPORT_FILE` lives **on your local machine**, not on the server. Keep it outside the repo (e.g. in your Nextcloud or Downloads folder) and use an absolute path. `scripts/*.xlsx` is also gitignored as a safety net.

### Run

`bun run import-users` automatically loads `scripts/.env` via Bun's `--env-file` flag (configured in `package.json`).

Dry-run (the default — no writes happen):
```bash
bun run import-users
```

Sample output:
```
MODE: dry-run (no writes)
  url:      https://chat.example.com
  file:     /home/you/imports/users.xlsx
  group:    KeyUser
  password: <your default>
logged in as admin@example.com (superadmin)
resolved group KeyUser → <uuid>
fetched 12 existing user(s) on the live DB
parsed 50 row(s) from /home/you/imports/users.xlsx

[skip] row 7: invalid email ""
[DRY]  would create email=alice@example.com username=alice
[skip] already exists: bob@example.com
...
DRY-RUN: would create 37 · skip 12 (already exist) · invalid 1
Re-run with --apply to actually create the users.
```

If the numbers look right, commit the changes:
```bash
bun run import-users --apply
```

### CLI flags (override env)

| Flag                  | Env var                   |
| --------------------- | ------------------------- |
| `--url=<base>`        | `IMPORT_URL`              |
| `--file=<path>`       | `IMPORT_FILE`             |
| `--group=<name>`      | `IMPORT_GROUP`            |
| `--password=<pw>`     | `IMPORT_DEFAULT_PASSWORD` |
| `--admin-email=<x>`   | `IMPORT_ADMIN_EMAIL`      |
| `--admin-password=<x>`| `IMPORT_ADMIN_PASSWORD`   |
| `--apply`             | —                         |
| `-h`, `--help`        | —                         |

Flags are forwarded after `--`:
```bash
bun run import-users -- --apply
bun run import-users -- --group=Editors
```

### Caveats

- **Same default password for everyone in a batch.** Hand it out via a secure channel and instruct users to rotate it from their profile screen on first login.
- **The script runs from your machine**, talking to the public URL of the deployment. No SSH or DB access needed — just network reachability to `IMPORT_URL` and valid superadmin credentials.
- **Group must exist** on the target instance. The script aborts cleanly with the list of available groups if not.
- **Re-runs are safe.** Existing users (matched by lowercased email) are skipped, never overwritten. You can re-run a partially failed batch.
- **Exit codes:** `0` = success, `1` = config / pre-flight error, `2` = at least one create failed under `--apply`.
