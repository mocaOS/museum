import type { Metadata } from "next";
import manifesto from "@/content/manifesto.json";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "The Museum of Crypto Art manifesto — our mission to preserve the truth and define the crypto art movement.",
};

// Full-bleed, white-on-black statement page. The MOCA wordmark spans the full
// container width in white (forced via a brightness/invert filter on the
// shared /logo.svg), then the manifesto text.
export default function ManifestoPage() {
  return (
    <div style={{ background: "#000", color: "#fff" }}>
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <img
          src="/logo.svg"
          alt="Museum of Crypto Art"
          className="mb-16 w-full"
          style={{ filter: "brightness(0) invert(1)" }}
        />

        <h1
          className="text-3xl font-semibold sm:text-4xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          {manifesto.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed sm:text-xl" style={{ color: "#fff" }}>
          {manifesto.tagline}
        </p>

        <div className="mt-12 flex flex-col gap-6">
          {manifesto.paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.82)" }}
            >
              {p}
            </p>
          ))}
        </div>

        <p
          className="mt-14 text-2xl font-medium leading-snug sm:text-3xl"
          style={{ letterSpacing: "-0.01em" }}
        >
          {manifesto.closing}
        </p>
      </div>
    </div>
  );
}
