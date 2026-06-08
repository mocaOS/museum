import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { BackendError } from "@/lib/backend";

// Run an admin-only backend operation. Handles auth (401/403), upstream
// errors (BackendError.status), and unknown errors (502).
export async function adminBackendRoute<T>(
  fn: () => Promise<T>
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await fn();
    if (result === undefined) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BackendError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backend error" },
      { status: 502 }
    );
  }
}
