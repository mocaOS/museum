/** Client-safe display helpers for wallet UI. */

/** 0x1234…abcd */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= lead + tail) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * Format a token amount (a decimal string from viem's formatUnits) for display:
 * thousands separators, up to `maxFractionDigits` decimals, trailing zeros
 * trimmed. Falls back to the raw string if it isn't a finite number.
 */
export function formatTokenAmount(value: string, maxFractionDigits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}
