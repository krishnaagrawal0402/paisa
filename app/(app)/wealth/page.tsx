import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata = { title: "Wealth" };

export default function WealthPage() {
  return (
    <ComingSoon
      title="Wealth"
      milestone="M5"
      points={[
        "Net worth trend: assets minus liabilities",
        "Mutual funds priced daily, FDs computed, everything else manual",
        "Loans and EMIs with payoff dates",
      ]}
    />
  );
}
