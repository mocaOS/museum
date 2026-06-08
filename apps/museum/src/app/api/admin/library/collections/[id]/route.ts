import { z } from "zod";
import { NextResponse } from "next/server";
import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { deleteCollection, renameCollection } from "@/lib/backend";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  return adminBackendRoute(() => renameCollection(id, parsed.data));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return adminBackendRoute(() => deleteCollection(id));
}
