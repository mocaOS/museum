import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { listDocuments } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const collectionId = url.searchParams.get("collection_id") || undefined;
  const status = url.searchParams.get("status") || undefined;
  return adminBackendRoute(() =>
    listDocuments({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      collection_id: collectionId,
      status,
    })
  );
}
