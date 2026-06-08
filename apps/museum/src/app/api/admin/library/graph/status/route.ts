import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { getGraphStatus } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collection_id") || undefined;
  return adminBackendRoute(() => getGraphStatus(collectionId));
}
