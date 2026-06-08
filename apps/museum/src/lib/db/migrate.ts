import "server-only";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import { db } from "./client";

let applied = false;

export function runMigrations() {
  if (applied) return;
  const migrationsFolder = resolve(
    process.cwd(),
    "src/lib/db/migrations"
  );
  migrate(db, { migrationsFolder });
  applied = true;
}
