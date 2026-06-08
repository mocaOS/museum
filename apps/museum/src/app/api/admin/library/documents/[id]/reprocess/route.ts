import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { reprocessDocument } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return adminBackendRoute(() => reprocessDocument(id));
}
