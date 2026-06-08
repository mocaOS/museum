import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { getTask } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return adminBackendRoute(() => getTask(id));
}
