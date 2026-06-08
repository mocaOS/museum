import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import {
  deleteAvatar,
  extForMime,
  isAcceptedMime,
  MAX_AVATAR_BYTES,
  saveAvatar,
} from "@/lib/avatars";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user } = await requireAuth();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAcceptedMime(file.type)) {
    return NextResponse.json(
      { error: "Supported formats: PNG, JPEG, WebP, GIF." },
      { status: 400 }
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "Avatar must be 2 MiB or smaller." },
      { status: 413 }
    );
  }

  const ext = extForMime(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = saveAvatar(user.id, buffer, ext);

  db.update(users)
    .set({ avatarPath: filename, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  return NextResponse.json({ avatarUrl: `/api/avatars/${user.id}` });
}

export async function DELETE() {
  const { user } = await requireAuth();
  deleteAvatar(user.id);
  db.update(users)
    .set({ avatarPath: null, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();
  return NextResponse.json({ ok: true });
}
