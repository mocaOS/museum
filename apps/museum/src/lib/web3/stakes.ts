import "server-only";
import { formatUnits, getAddress } from "viem";
import { getPublicClient } from "./chains";
import { POLYGON } from "./assets";
import {
  STAKING_ABI,
  STAKE_POOLS,
  STAKE_TOKENS,
  type StakePosition,
} from "./staking";

/**
 * Read a wallet's remaining stake across all 12 legacy MOCA pools on Polygon.
 *
 * One multicall reads `balanceOf` + `earned` + `periodFinish` for every pool
 * (36 calls, batched via Polygon's multicall3). We surface a pool only when the
 * wallet still has principal staked or an unclaimed $MOCA reward. Amounts are
 * returned both raw (wei string, for the exact `withdraw`/`exit` tx) and
 * pre-formatted for display, matching the holdings.ts pattern. Reads are
 * server-side so the RPC endpoint never reaches the browser.
 */

const ZERO = BigInt(0); // include anything strictly positive

export async function getStakePositions(
  address: string,
): Promise<StakePosition[]> {
  const owner = getAddress(address);
  const client = getPublicClient(POLYGON);

  const contracts = STAKE_POOLS.flatMap((pool) => [
    { address: pool.address, abi: STAKING_ABI, functionName: "balanceOf", args: [owner] } as const,
    { address: pool.address, abi: STAKING_ABI, functionName: "earned", args: [owner] } as const,
    { address: pool.address, abi: STAKING_ABI, functionName: "periodFinish", args: [] } as const,
  ]);

  const results = await client.multicall({ contracts, allowFailure: true });

  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  const positions: StakePosition[] = [];

  STAKE_POOLS.forEach((pool, i) => {
    const staked = results[i * 3];
    const earned = results[i * 3 + 1];
    const periodFinish = results[i * 3 + 2];

    // A failed read for one pool must not sink the whole response.
    const stakedWei = staked.status === "success" ? (staked.result as bigint) : ZERO;
    const earnedWei = earned.status === "success" ? (earned.result as bigint) : ZERO;
    if (stakedWei <= ZERO && earnedWei <= ZERO) return;

    const finishTs =
      periodFinish.status === "success" ? (periodFinish.result as bigint) : ZERO;
    const token = STAKE_TOKENS[pool.token];

    positions.push({
      pool: pool.address,
      token: pool.token,
      tokenLabel: token.label,
      tokenSymbol: token.symbol,
      vintage: pool.vintage,
      staked: stakedWei.toString(),
      stakedFormatted: formatUnits(stakedWei, token.decimals),
      earned: earnedWei.toString(),
      earnedFormatted: formatUnits(earnedWei, STAKE_TOKENS.MOCA.decimals),
      // A finished period (finishTs in the past, and set) means exit() is safe.
      periodFinished: finishTs > ZERO && finishTs < nowSecs,
    });
  });

  return positions;
}
