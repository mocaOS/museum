// Utility to normalize wallet/provider errors across Ethers, WalletConnect, Coinbase, MetaMask, and viem

export type NormalizedWalletError =
  | { kind: "userRejected"; code: 4001 | "ACTION_REJECTED"; message: string }
  | { kind: "requestPending"; code: -32002; message: string }
  | { kind: "unauthorized"; code: 4100; message: string }
  | { kind: "unsupportedMethod"; code: 4200; message: string }
  | { kind: "disconnected"; code: 4900 | 4901; message: string }
  | { kind: "rpc"; code: number; message: string }
  | { kind: "unknown"; message: string };

// Extract the best human-readable message from a chain of possible nested errors
function extractMessage(stack: any[]): string {
  const short = stack.find((x) => typeof x?.shortMessage === "string")?.shortMessage;
  if (short) return short;
  const msg = stack.find((x) => typeof x?.message === "string")?.message;
  if (msg) return msg;
  return "Unknown wallet error";
}

export function normalizeWalletError(err: unknown): NormalizedWalletError {
  // Unwrap common nesting: cause, error, data.originalError, details.error
  const trail: any[] = [];
  let e: any = err;
  while (e && !trail.includes(e)) {
    trail.push(e);
    e = e?.cause ?? e?.error ?? e?.data?.originalError ?? e?.details?.error ?? null;
  }
  const stack = trail.filter(Boolean);

  const hasCode = (code: unknown) => stack.find((x) => x?.code === code);
  const hasNameOrCodeString = (name: string) =>
    stack.find((x) => x?.name === name || String(x?.code) === name);

  const message = extractMessage(stack);

  // EIP-1193 standard user rejection and Ethers v6 ACTION_REJECTED
  if (hasCode(4001) || hasNameOrCodeString("USER_REJECTED_REQUEST")) {
    return { kind: "userRejected", code: 4001, message };
  }
  if (hasCode("ACTION_REJECTED") || hasNameOrCodeString("ACTION_REJECTED")) {
    return { kind: "userRejected", code: "ACTION_REJECTED", message };
  }

  if (hasCode(-32002)) return { kind: "requestPending", code: -32002, message };
  if (hasCode(4100)) return { kind: "unauthorized", code: 4100, message };
  if (hasCode(4200)) return { kind: "unsupportedMethod", code: 4200, message };
  if (hasCode(4901)) return { kind: "disconnected", code: 4901, message };
  if (hasCode(4900)) return { kind: "disconnected", code: 4900, message };

  const rpcErr = stack.find((x) => typeof x?.code === "number");
  if (rpcErr) return { kind: "rpc", code: rpcErr.code, message };

  return { kind: "unknown", message };
}

export function walletErrorToMessage(normalized: NormalizedWalletError): string {
  switch (normalized.kind) {
    case "userRejected":
      return "You cancelled the signature request.";
    case "requestPending":
      return "A request is already pending in your wallet. Please approve or reject it.";
    case "unauthorized":
      return "Wallet is not authorized for this action.";
    case "unsupportedMethod":
      return "Your wallet does not support this method.";
    case "disconnected":
      return "Your wallet is disconnected. Please reconnect and try again.";
    case "rpc":
      return normalized.message || "A wallet RPC error occurred.";
    default:
      return normalized.message || "An unknown wallet error occurred.";
  }
}


