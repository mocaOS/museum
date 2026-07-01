import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { StakeManager } from "@/components/stake/StakeManager";

export const metadata: Metadata = pageMetadata({
  title: "Withdraw staked $MOCA",
  description:
    "Withdraw your $MOCA, MOCA/USDC LP, and MOCA/WETH LP tokens from the legacy MOCA staking pools on Polygon. Connect your wallet, review your positions, and unstake in one transaction.",
  path: "/unstake",
});

export default function UnstakePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <header className="mb-8">
        <p
          className="mb-3 text-[11px] uppercase tracking-[0.08em]"
          style={{ color: "var(--fg2)" }}
        >
          Legacy staking · Polygon
        </p>
        <h1
          className="mb-4 text-3xl sm:text-4xl"
          style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
        >
          Withdraw your staked tokens
        </h1>
        <p className="max-w-2xl text-base leading-relaxed" style={{ color: "var(--fg2)" }}>
          MOCA ran token-staking programs on Polygon from 2021 to 2023. Those
          reward periods have all ended, but stake left in the pools is still
          yours to reclaim at any time — there is no lock-up. Connect the wallet
          you staked with and withdraw your $MOCA or LP tokens, plus any
          unclaimed $MOCA rewards, in a single transaction. You interface with
          the contracts directly and pay your own network fee (POL) on Polygon.
        </p>
      </header>

      <StakeManager />

      <p className="mt-10 text-xs leading-relaxed" style={{ color: "var(--fg3)" }}>
        Withdrawals call the staking contracts&rsquo; own <code>exit</code>{" "}
        function, which returns your staked balance and any remaining rewards to
        your wallet. The museum never takes custody of your tokens and cannot
        move them on your behalf — every action is a transaction you sign.
      </p>
    </main>
  );
}
