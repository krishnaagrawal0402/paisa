import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata = { title: "Plan" };

export default function PlanPage() {
  return (
    <ComingSoon
      title="Plan"
      milestone="M3 / M6"
      points={[
        "Recurring salary, rent, SIPs and subscriptions",
        "Monthly budgets per category",
        "Goals and an emergency fund that track themselves",
      ]}
    />
  );
}
