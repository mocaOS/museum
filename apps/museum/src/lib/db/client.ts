import "server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _sqlite: Database.Database | undefined;
let _db: DrizzleDB | undefined;

function open() {
  if (_sqlite && _db) return { sqlite: _sqlite, db: _db };
  const dbPath = resolve(process.env.DATABASE_PATH || "./data/cortex-chat.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return { sqlite: _sqlite, db: _db };
}

function proxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_, prop, receiver) {
      const target = getTarget();
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const db = proxy<DrizzleDB>(() => open().db);
export const sqlite = proxy<Database.Database>(() => open().sqlite);
