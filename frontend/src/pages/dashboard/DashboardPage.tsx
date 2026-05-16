import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { getDashboardStats } from "../../api/dashboard";
import type { DashboardStats } from "../../api/dashboard";

function StatCard({
  label,
  value,
  sub,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function EmptyPanel({ label, cta, to }: { label: string; cta: string; to: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 border-dashed p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[160px]">
      <p className="text-gray-500 text-sm">{label}</p>
      <Link to={to} className="text-accent text-sm hover:underline">
        {cta} →
      </Link>
    </div>
  );
}

function AtsScoreGauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col items-center justify-center min-h-[160px]">
        <p className="text-gray-500 text-sm text-center">No ATS scores yet</p>
        <Link to="/analyze" className="text-accent text-sm hover:underline mt-2">Score a resume →</Link>
      </div>
    );
  }
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 40;
  const progress = (score / 100) * circumference;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col items-center gap-2">
      <p className="text-gray-400 text-xs uppercase tracking-wide self-start">Avg ATS Score</p>
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <p className="text-3xl font-bold -mt-4" style={{ color }}>{score}</p>
      <p className="text-gray-500 text-xs">across all scored resumes</p>
    </div>
  );
}

function AtsHistoryChart({ data }: { data: { score: number; date: string }[] }) {
  if (data.length < 2) return null;
  const formatted = data.map((d) => ({
    score: d.score,
    date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-4">ATS Score History</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} width={28} />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 12 }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KeywordsChart({ data }: { data: { term: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <EmptyPanel
        label="No keyword data yet. Score some resumes to see which skills you're missing most."
        cta="Score a resume"
        to="/analyze"
      />
    );
  }
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-4">Top Missing Keywords</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.slice(0, 8)} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
          <YAxis
            type="category" dataKey="term"
            tick={{ fontSize: 11, fill: "#d1d5db" }}
            width={80}
          />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.slice(0, 8).map((_, i) => (
              <Cell key={i} fill={i < 3 ? "#ef4444" : i < 6 ? "#f59e0b" : "#6366f1"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SkillGapProgress({ summary }: { summary: DashboardStats["skill_gap_summary"] }) {
  if (summary.total === 0) {
    return (
      <EmptyPanel
        label="No skill gaps tracked yet."
        cta="Run a skill gap analysis"
        to="/analyze?tab=skill-gaps"
      />
    );
  }
  const pct = Math.round((summary.acquired / summary.total) * 100);
  const bars = [
    { label: "Identified", value: summary.identified, color: "bg-gray-600" },
    { label: "Learning", value: summary.learning, color: "bg-blue-500" },
    { label: "Acquired", value: summary.acquired, color: "bg-green-500" },
    { label: "Not pursuing", value: summary.not_pursuing, color: "bg-gray-800" },
  ];
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-xs uppercase tracking-wide">Skill Gap Progress</p>
        <Link to="/analyze?tab=skill-gaps" className="text-accent text-xs hover:underline">View all →</Link>
      </div>
      <div className="flex items-end gap-1 h-16">
        {bars.map((b) =>
          b.value > 0 ? (
            <div
              key={b.label}
              className={`${b.color} rounded-t flex-1 transition-all`}
              style={{ height: `${Math.max(8, (b.value / summary.total) * 100)}%` }}
              title={`${b.label}: ${b.value}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${b.color}`} />
            {b.label} ({b.value})
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Acquired</span>
          <span>{pct}%</span>
        </div>
        <div className="bg-gray-800 rounded-full h-1.5">
          <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  tailored: "Tailored a resume",
  ai_call: "AI call",
  security_block: "Blocked suspicious input",
  injection_detected: "Injection attempt detected",
};

function ActivityFeed({ items }: { items: DashboardStats["recent_activity"] }) {
  if (items.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col items-center justify-center min-h-[160px]">
        <p className="text-gray-500 text-sm">No activity yet</p>
      </div>
    );
  }
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-4">Recent Activity</p>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0">
              <span className="text-white">{ACTION_LABELS[item.action] ?? item.action}</span>
              <span className="text-gray-600 ml-1 text-xs">
                {new Date(item.created_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const atsColor =
    stats.avg_ats_score === null ? "text-gray-500" :
    stats.avg_ats_score >= 70 ? "text-green-400" :
    stats.avg_ats_score >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Your job search at a glance</p>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Avg ATS Score"
          value={stats.avg_ats_score ?? "—"}
          sub={`across ${stats.total_scores} scored resume${stats.total_scores !== 1 ? "s" : ""}`}
          color={atsColor}
        />
        <StatCard
          label="Tailored Variants"
          value={stats.total_variants}
          sub="total resume variants created"
        />
        <StatCard
          label="Skill Gaps"
          value={stats.skill_gap_summary.total}
          sub={`${stats.skill_gap_summary.acquired} acquired · ${stats.skill_gap_summary.learning} learning`}
          color="text-blue-400"
        />
        <StatCard
          label="AI Usage (this month)"
          value={`$${stats.ai_usage.estimated_cost_usd}`}
          sub={`${stats.ai_usage.tailor_runs_this_month} tailor run${stats.ai_usage.tailor_runs_this_month !== 1 ? "s" : ""}`}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ATS gauge */}
        <AtsScoreGauge score={stats.avg_ats_score} />

        {/* ATS history or keywords */}
        {stats.ats_history.length >= 2
          ? <AtsHistoryChart data={stats.ats_history} />
          : <KeywordsChart data={stats.top_missing_keywords} />
        }

        {/* Keywords (only show separately if history was shown) */}
        {stats.ats_history.length >= 2 && (
          <KeywordsChart data={stats.top_missing_keywords} />
        )}

        {/* Skill gap progress */}
        <SkillGapProgress summary={stats.skill_gap_summary} />

        {/* Application tracker placeholder */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 border-dashed p-6 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
          <p className="text-gray-500 text-sm font-medium">Application Tracker</p>
          <p className="text-gray-600 text-xs max-w-xs">
            Track applications and see your funnel here once the tracker is enabled.
          </p>
        </div>

        {/* Recent activity */}
        <ActivityFeed items={stats.recent_activity} />
      </div>
    </div>
  );
}
