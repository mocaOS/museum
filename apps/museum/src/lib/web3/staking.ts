/**
 * Legacy MOCA staking pools on Polygon.
 *
 * These 12 contracts are EIP-1167 minimal-proxy clones of a Synthetix-style
 * `StakingRewards` contract (two implementation vintages, identical interface).
 * They ran the 2021–2023 MOCA farming programs; every reward period has long
 * since finished and none of them carry a withdrawal timelock, so anyone with a
 * remaining stake can pull it out at any time.
 *
 * Withdrawal mechanics (verified against the on-chain source):
 * - `withdraw(amount)` — no modifiers, no lock, no approval. Sends the staked
 *   token back. Reverts only if `amount > yourBalance`.
 * - `getReward()` — sends earned $MOCA. Guarded by `isPeriodFinished` (passes,
 *   because every period is over).
 * - `exit()` — `withdraw(fullBalance)` + `getReward()` in one transaction, i.e.
 *   principal AND any leftover $MOCA rewards. This is the one-click path.
 *
 * The contracts resolve `msgSender()` to `msg.sender` for a normal EOA call, so
 * a standard wallet transaction is all that's needed — no Biconomy meta-tx, no
 * relayer. Users interface directly and pay their own POL gas.
 */

export const POLYGON_CHAIN_ID = 137 as const;

/** Minimal ABI — only the reads we surface and the writes we send. */
export const STAKING_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "earned",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodFinish",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getReward",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "exit",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

/** The three staking-token kinds these pools accept. */
export type StakeTokenKey = "MOCA" | "MOCA_USDC_LP" | "MOCA_WETH_LP";

export interface StakeTokenMeta {
  key: StakeTokenKey;
  /** ERC-20 address of the staked token on Polygon. */
  address: `0x${string}`;
  /** Short symbol shown next to amounts. */
  symbol: string;
  /** Human label for headings. */
  label: string;
  decimals: number;
  /** LP tokens can't just be spent — they're a Quickswap position. */
  kind: "single" | "lp";
}

export const STAKE_TOKENS: Record<StakeTokenKey, StakeTokenMeta> = {
  MOCA: {
    key: "MOCA",
    address: "0xcE899f26928a2B21c6a2Fddd393EF37c61dbA918",
    symbol: "MOCA",
    label: "$MOCA",
    decimals: 18,
    kind: "single",
  },
  MOCA_USDC_LP: {
    key: "MOCA_USDC_LP",
    address: "0xfD0d4cBa23Ed8307d4E92f8C4468eCb6f976774E",
    symbol: "MOCA-USDC LP",
    label: "MOCA / USDC LP",
    decimals: 18,
    kind: "lp",
  },
  MOCA_WETH_LP: {
    key: "MOCA_WETH_LP",
    address: "0x7849e5F46131ab8377d132A9361C90d940345630",
    symbol: "MOCA-WETH LP",
    label: "MOCA / WETH LP",
    decimals: 18,
    kind: "lp",
  },
};

export interface StakePool {
  /** Pool (clone) address on Polygon. */
  address: `0x${string}`;
  /** Which token it accepts. */
  token: StakeTokenKey;
  /** Program year, for disambiguating pools that share a token. */
  vintage: string;
}

/**
 * All 12 pools. Reward token is $MOCA on every one; `token` below is the STAKED
 * token you get back. Addresses are Polygon, checksummed.
 */
export const STAKE_POOLS: StakePool[] = [
  { address: "0xC113921884adFaE7dC3705764c47Ec797C6684C7", token: "MOCA", vintage: "2021" },
  { address: "0x4C6a3772C7AB7f13151CD2f681888636D22D2bD3", token: "MOCA", vintage: "2021" },
  { address: "0x3201983CD4Aa2aFa76eF31e2a18C0a7cBd3a7b69", token: "MOCA", vintage: "2022" },
  { address: "0x4F8d3ED4cE8faf224C316F28027E92b751A0E363", token: "MOCA", vintage: "2023" },
  { address: "0xBD31e30E93fbE71EA99E3fb92cb4a5552EdFAcD8", token: "MOCA_USDC_LP", vintage: "2021" },
  { address: "0xD8203b7bEe22986B7fbb678703580A2134C4b802", token: "MOCA_USDC_LP", vintage: "2021" },
  { address: "0xcDA170b6352B0bFF69Df3e6aEd2cc16Aa6F770Fa", token: "MOCA_USDC_LP", vintage: "2022" },
  { address: "0x8E847Abb778932F2Ab779DB2DA7547109319882B", token: "MOCA_USDC_LP", vintage: "2023" },
  { address: "0xdC5F9cb719f88cb4809A08db920b855e2C24e0b6", token: "MOCA_WETH_LP", vintage: "2021" },
  { address: "0xf064c7994B824DA5C6E7C16f58d6B10c4E4fD732", token: "MOCA_WETH_LP", vintage: "2021" },
  { address: "0x6D054908Fd75e6FAb9B78D6Dd864a42F356985F4", token: "MOCA_WETH_LP", vintage: "2022" },
  { address: "0xcbf164315A45F9C097dBCDb7a73b6198B2C34E88", token: "MOCA_WETH_LP", vintage: "2023" },
];

export function polygonscanAddress(address: string): string {
  return `https://polygonscan.com/address/${address}`;
}

export function polygonscanTx(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`;
}

/** A wallet's position in one pool, as returned by /api/stakes. */
export interface StakePosition {
  /** Pool (clone) contract address on Polygon. */
  pool: `0x${string}`;
  token: StakeTokenKey;
  tokenLabel: string;
  tokenSymbol: string;
  vintage: string;
  /** Staked principal — raw wei string. */
  staked: string;
  stakedFormatted: string;
  /** Unclaimed $MOCA reward — raw wei string. */
  earned: string;
  earnedFormatted: string;
  /** Whether the reward period is over (it always is for these pools). When
   *  true, `exit()` is safe; when false, we fall back to principal-only. */
  periodFinished: boolean;
}

export interface StakesResponse {
  address: string;
  positions: StakePosition[];
}
