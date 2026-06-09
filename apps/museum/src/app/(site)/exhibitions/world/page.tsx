import type { Metadata } from "next";
import Link from "next/link";
import { listRooms, assetUrl } from "@/lib/museum/directus";
import WorldClient from "@/components/museum/three/WorldClient";
import type { WorldRoom } from "@/components/museum/three/WorldBuilder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World (experimental)",
  description:
    "Place MOCA exhibition rooms into a shared world and explore them from above — an experimental RTS-style 3D mode.",
};

export default async function WorldPage() {
  const rooms = await listRooms();
  const worldRooms: WorldRoom[] = rooms.map((r) => ({
    id: r.id,
    title: r.title || "Untitled room",
    architect: r.architect,
    modelUrl: r.model ? assetUrl(r.model) : undefined,
    imageUrl: r.image ? assetUrl(r.image) : undefined,
  }));

  return (
    <div className="relative" style={{ height: "calc(100dvh - 4rem)" }}>
      <div className="absolute left-4 top-3 z-20">
        <Link
          href="/exhibitions"
          className="flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs"
          style={{ background: "oklch(0.14 0 0 / 0.8)", borderColor: "var(--border)", color: "var(--fg1)", backdropFilter: "blur(12px)" }}
        >
          ← Exhibitions
        </Link>
      </div>
      <div className="absolute right-4 top-3 z-20">
        <span
          className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em]"
          style={{ background: "oklch(0.14 0 0 / 0.8)", borderColor: "var(--border)", color: "var(--fg3)" }}
        >
          Experimental
        </span>
      </div>
      <WorldClient rooms={worldRooms} />
    </div>
  );
}
