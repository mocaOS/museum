import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { cleanupOrphanedEntities } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST() {
  return adminBackendRoute(() => cleanupOrphanedEntities());
}
