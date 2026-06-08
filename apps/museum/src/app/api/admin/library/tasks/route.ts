import { adminBackendRoute } from "@/lib/backend/route-helpers";
import { listTasks } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  return adminBackendRoute(async () => {
    const tasks = await listTasks({
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return { tasks };
  });
}
