import { z } from "zod";
import { NextResponse } from "next/server";
import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { createCollection, listBackendCollections } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  return adminBackendRoute(async () => {
    const collections = await listBackendCollections();
    return { collections };
  });
}

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  return adminBackendRoute(() => createCollection(parsed.data));
}
