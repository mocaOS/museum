import { z } from "zod";
import { NextResponse } from "next/server";
import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { analyzeRelationships } from "@/lib/backend";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    collection_id: z.string().min(1).optional(),
    rebuild: z.boolean().optional(),
  })
  .default({});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  return adminBackendRoute(() => analyzeRelationships(parsed.data));
}
