import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { deleteDocument } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return adminBackendRoute(() => deleteDocument(id));
}
