import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { getBackendStats } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  return adminBackendRoute(() => getBackendStats());
}
