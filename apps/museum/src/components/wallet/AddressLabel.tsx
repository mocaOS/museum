"use client";

import type { CSSProperties } from "react";
import { truncateAddress } from "@/lib/web3/format";

/**
 * Presentational address label: shows a resolved ENS name when one is passed,
 * otherwise the truncated `0x1234…abcd` form. ENS resolution itself lives in
 * `useEnsNames` (batched + cached) so this stays a pure render.
 */
export function AddressLabel({
  address,
  name,
  lead = 6,
  tail = 4,
  className,
  style,
}: {
  address: string;
  name?: string | null;
  lead?: number;
  tail?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={style} title={address}>
      {name || truncateAddress(address, lead, tail)}
    </span>
  );
}
