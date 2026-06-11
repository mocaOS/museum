// Disabled primary CTA for products that aren't live yet — swaps its label
// for "Coming Soon" on hover. Both labels share one grid cell so the button
// keeps the width of the longer label instead of resizing on hover.
export default function ComingSoonButton({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      className="group flex h-11 cursor-not-allowed items-center rounded-[var(--radius)] px-6 text-sm font-medium opacity-60"
      style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
    >
      <span className="grid text-center">
        <span className="col-start-1 row-start-1 transition-opacity duration-150 group-hover:opacity-0">
          {label}
        </span>
        <span className="col-start-1 row-start-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          Coming Soon
        </span>
      </span>
    </span>
  );
}
