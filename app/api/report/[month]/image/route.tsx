import { ImageResponse } from "next/og";
import { appConfig } from "@/config/app";
import { formatCompactINR } from "@/lib/money";
import { getReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/supabase/server";

const GRADE_COLOR = { A: "#3dff9a", B: "#22d3ee", C: "#ffb020", D: "#ff3d81" } as const;

/**
 * The shareable month card (1080×1350, Instagram portrait). Percentages only
 * unless ?amounts=1. Rendered for the signed-in user only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response("Bad month", { status: 400 });
  if (!(await getCurrentUser())) return new Response("Sign in first", { status: 401 });

  const withAmounts = new URL(request.url).searchParams.get("amounts") === "1";
  const r = await getReport(month);
  const color = GRADE_COLOR[r.health.grade];
  const rate = r.totals.savingsRate === null ? "–" : `${Math.round(r.totals.savingsRate * 100)}%`;
  const investRate =
    r.totals.income > 0 ? `${Math.round((Math.max(0, r.totals.invested) / r.totals.income) * 100)}%` : "–";
  // The bundled OG font has no ₹ glyph, so amounts render as "1.2L" under a labelled tile.
  const amount = (paise: number) => formatCompactINR(paise).replace("₹", "");
  const top = r.topCategories[0];

  const tiles: [string, string][] = withAmounts
    ? [
        ["Earned (INR)", amount(r.totals.income)],
        ["Spent (INR)", amount(r.totals.spent)],
        ["Saved", rate],
        ["Invested", investRate],
      ]
    : [
        ["Saved of income", rate],
        ["Invested of income", investRate],
        ["No-spend days", `${r.noSpendDays}/${r.daysCounted}`],
        ["Budgets kept", r.budgets.total ? `${r.budgets.kept}/${r.budgets.total}` : "–"],
      ];

  const circumference = 2 * Math.PI * 150;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "90px 80px",
        background: "radial-gradient(circle at 50% 18%, #2a1f55 0%, #07070b 58%)",
        color: "#f4f4f5",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: "#a1a1aa" }}>
        {appConfig.name.toUpperCase()}
      </div>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 16 }}>{r.month.label}</div>

      <div
        style={{
          display: "flex",
          position: "relative",
          width: 360,
          height: 360,
          marginTop: 60,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="360"
          height="360"
          viewBox="0 0 360 360"
          style={{ position: "absolute", transform: "rotate(-90deg)" }}
        >
          <circle cx="180" cy="180" r="150" fill="none" stroke="#1d1d26" strokeWidth="26" />
          <circle
            cx="180"
            cy="180"
            r="150"
            fill="none"
            stroke={color}
            strokeWidth="26"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - r.health.score / 100)}`}
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 700, color, lineHeight: 1 }}>{r.health.grade}</div>
          <div style={{ display: "flex", fontSize: 34, color: "#a1a1aa", marginTop: 4 }}>{r.health.score}/100</div>
        </div>
      </div>

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 70, width: "100%", justifyContent: "center" }}
      >
        {tiles.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              width: 430,
              padding: "30px 36px",
              borderRadius: 32,
              background: "rgba(255,255,255,0.05)",
              border: "2px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa" }}>{label}</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>

      {top && (
        <div style={{ display: "flex", fontSize: 32, color: "#a1a1aa", marginTop: 48 }}>
          {`Most spent on ${top.name} (${Math.round(top.share * 100)}%)`}
        </div>
      )}
      <div style={{ display: "flex", marginTop: "auto", fontSize: 26, color: "#71717a" }}>
        Made with Paisa · open-source money manager
      </div>
    </div>,
    { width: 1080, height: 1350 },
  );
}
