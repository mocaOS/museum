import type { Metadata } from "next";
import pressRoom from "@/content/press-room.json";
import PressRoomBrowser, { type PressRoom } from "@/components/museum/PressRoomBrowser";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Press Room",
  description:
    "Media coverage, interviews, podcast appearances, and the press kit for the Museum of Crypto Art.",
  path: "/press-room",
});

export default function PressRoomPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          Newsroom
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          Press Room
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          {pressRoom.intro}
        </p>
      </header>
      <PressRoomBrowser data={pressRoom as PressRoom} />
    </div>
  );
}
