import "server-only";

/**
 * Library admin whitelist — the ETH addresses allowed to review and approve
 * community document submissions into Cortex. Managed via the
 * `LIBRARY_ADMIN_ADDRESSES` env var (comma-separated), matched case-insensitively.
 * There is no admin UI: change the env and redeploy.
 */

const ADDRESS_RE = /^0x[a-f0-9]{40}$/;

export function getLibraryAdmins(): string[] {
  return (process.env.LIBRARY_ADMIN_ADDRESSES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((a) => ADDRESS_RE.test(a));
}

export function isLibraryAdmin(address: string | null | undefined): boolean {
  if (!address) return false;
  return getLibraryAdmins().includes(address.toLowerCase());
}
