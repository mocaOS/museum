import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "./password";
import { newId } from "./crypto";

// On each server start, upsert the superadmin row from env.
// Rationale: email/password rotation via env is a single-source-of-truth model
// for the sole bootstrap user and avoids an interactive setup flow.
export async function bootstrapSuperadmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      "[bootstrap] SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD not set — superadmin not provisioned."
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existing) {
    db.update(users)
      .set({
        passwordHash,
        role: "superadmin",
        updatedAt: Date.now(),
      })
      .where(eq(users.id, existing.id))
      .run();
    return;
  }

  db.insert(users)
    .values({
      id: newId(),
      email,
      passwordHash,
      username: "Admin",
      role: "superadmin",
    })
    .run();
}
