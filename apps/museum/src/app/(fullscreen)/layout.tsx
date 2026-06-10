import SiteHeader from "@/components/site/SiteHeader";

// Fullscreen app surfaces (the 3D exhibition world builder): site header, no
// footer, and no page scroll — the canvas owns the viewport. Without this the
// footer pushes the page past 100dvh and the body scrollbar fights the 3D
// panels' own scroll areas.
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SiteHeader />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
