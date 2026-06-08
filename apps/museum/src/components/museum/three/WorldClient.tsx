"use client";

import dynamic from "next/dynamic";
import type { WorldRoom } from "./WorldBuilder";

const WorldBuilder = dynamic(() => import("./WorldBuilder"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: "oklch(0.7 0 0)" }}>
      Loading world…
    </div>
  ),
});

export default function WorldClient({ rooms }: { rooms: WorldRoom[] }) {
  return <WorldBuilder rooms={rooms} />;
}
