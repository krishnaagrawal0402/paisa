import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <ComingSoon
      title="Activity"
      milestone="M1"
      points={[
        "Every transaction, grouped by day",
        "Search and filter by account, category, type and date",
        "3-second quick add from the + button",
      ]}
    />
  );
}
