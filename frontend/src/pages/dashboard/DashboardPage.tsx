import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { listApplications, updateApplication } from "../../api/applications";
import type { Application, AppStatus } from "../../api/applications";
import { getDashboardStats } from "../../api/dashboard";
import type { DashboardStats } from "../../api/dashboard";

// ── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function isOverdue(follow_up_date: string | null): boolean {
  return !!follow_up_date && new Date(follow_up_date) < new Date();
}

// ── constants ─────────────────────────────────────────────────────────────────

const PIPELINE_COLUMNS: { status: AppStatus; label: string }[] = [
  { status: "saved",     label: "Saved" },
  { status: "tailoring", label: "Tailoring" },
  { status: "applied",   label: "Applied" },
  { status: "oa_screen", label: "OA / Screen" },
  { status: "interview", label: "Interview" },
  { status: "offer",     label: "Offer" },
  { status: "rejected",  label: "Rejected" },
];

const ACTIVE_STATUSES: AppStatus[] = ["saved", "tailoring", "applied", "oa_screen", "interview"];

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor = "text-gray-900" }: {
  label: string; value: string | number; sub?: string; valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function JobCard({
  app,
  onDragStart,
}: {
  app: Application;
  onDragStart: (id: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(app.id);
      }}
      className="bg-white rounded-lg border border-gray-200 p-3 mb-2 hover:border-gray-300 shadow-sm cursor-grab active:cursor-grabbing active:opacity-60 active:scale-95 transition-all"
    >
      <Link to="/applications" onClick={(e) => e.stopPropagation()}>
        <p className="text-gray-900 text-sm font-medium truncate">{app.company}</p>
        <p className="text-gray-500 text-xs truncate">{app.role_title}</p>
        <div className="flex items-center gap-2 mt-2">
          {app.ats_score !== null && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                app.ats_score >= 70
                  ? "bg-green-50 text-green-700"
                  : app.ats_score >= 50
                  ? "bg-yellow-50 text-yellow-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {app.ats_score}
            </span>
          )}
          <span className="text-gray-400 text-xs">{daysAgo(app.created_at)}d</span>
          {isOverdue(app.follow_up_date) && (
            <span className="text-red-500 text-xs">⚠</span>
          )}
        </div>
      </Link>
    </div>
  );
}

function PipelineColumn({
  status,
  label,
  apps,
  onDragStart,
  onDrop,
}: {
  status: AppStatus;
  label: string;
  apps: Application[];
  onDragStart: (id: string) => void;
  onDrop: (status: AppStatus) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isHighlight = status === "interview" || status === "offer";
  const isMuted = status === "rejected";

  return (
    <div
      className={`w-52 shrink-0 ${isMuted ? "opacity-60" : ""} ${
        isHighlight ? "border-l-2 border-accent pl-2" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(status); }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-700 text-sm font-medium">{label}</span>
        <span className="bg-gray-100 text-gray-500 rounded-full px-2 text-xs py-0.5">
          {apps.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className={`min-h-[4rem] rounded-lg transition-colors ${
          dragOver ? "bg-indigo-50 ring-2 ring-indigo-200" : ""
        }`}
      >
        {apps.slice(0, 5).map((app) => (
          <JobCard key={app.id} app={app} onDragStart={onDragStart} />
        ))}
        {apps.length > 5 && (
          <Link to="/applications" className="block text-center text-xs text-indigo-400 hover:underline py-2">
            +{apps.length - 5} more
          </Link>
        )}
        {apps.length === 0 && !dragOver && (
          <div className="border border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center">
            <span className="text-gray-300 text-xs">Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonPipeline() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-52 shrink-0">
          <div className="h-5 bg-gray-200 rounded animate-pulse mb-3 w-24" />
          <div className="h-16 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-16 bg-gray-200 rounded-lg animate-pulse mb-2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center text-center gap-4 max-w-sm w-full shadow-sm">
        <p className="text-2xl font-bold text-gray-900">JobCraft</p>
        <p className="text-gray-500 text-base">Ready to land your next role?</p>
        <Link
          to="/apply"
          className="bg-accent hover:opacity-90 text-white font-semibold px-6 py-3 rounded-lg transition-opacity"
        >
          Track your first job →
        </Link>
        <p className="text-gray-400 text-sm">
          Your job applications will appear here as a pipeline.
        </p>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const draggingId = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([listApplications(), getDashboardStats()])
      .then(([apps, s]) => { setApplications(apps); setStats(s); })
      .finally(() => setLoading(false));
  }, []);

  function handleDragStart(id: string) {
    draggingId.current = id;
  }

  async function handleDrop(targetStatus: AppStatus) {
    const id = draggingId.current;
    draggingId.current = null;
    if (!id) return;
    const app = applications.find((a) => a.id === id);
    if (!app || app.status === targetStatus) return;
    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: targetStatus } : a))
    );
    try {
      await updateApplication(id, { status: targetStatus });
    } catch {
      // Revert on failure
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: app.status } : a))
      );
    }
  }

  // ── derived stats ──────────────────────────────────────────────────────────

  const activeCount = applications.filter((a) =>
    ACTIVE_STATUSES.includes(a.status)
  ).length;

  const scoredApps = applications.filter((a) => a.ats_score !== null);
  const avgAts =
    scoredApps.length > 0
      ? Math.round(
          scoredApps.reduce((sum, a) => sum + (a.ats_score ?? 0), 0) /
            scoredApps.length
        )
      : null;

  const interviewCount = applications.filter(
    (a) => a.status === "interview"
  ).length;

  // ── column filtering ───────────────────────────────────────────────────────

  const visibleColumns = showClosed
    ? PIPELINE_COLUMNS
    : PIPELINE_COLUMNS.filter(
        (c) => c.status !== "rejected" && c.status !== "withdrawn"
      );

  const grouped = Object.fromEntries(
    PIPELINE_COLUMNS.map((c) => [
      c.status,
      applications.filter((a) => a.status === c.status),
    ])
  ) as Record<AppStatus, Application[]>;

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">Your job search pipeline</p>
          </div>
        </div>
        <SkeletonPipeline />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">Your job search pipeline</p>
          </div>
          <Link
            to="/apply"
            className="bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-opacity"
          >
            Track a Job →
          </Link>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Top bar */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your job search pipeline</p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Stats strip */}
          <div className="flex items-center gap-2">
            <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
              Active&nbsp;
              <span className="font-semibold text-gray-900">{activeCount}</span>
            </span>
            {avgAts !== null && (
              <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
                Avg ATS&nbsp;
                <span
                  className={`font-semibold ${
                    avgAts >= 70
                      ? "text-green-600"
                      : avgAts >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {avgAts}
                </span>
              </span>
            )}
            <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
              Interviews&nbsp;
              <span className="font-semibold text-gray-900">{interviewCount}</span>
            </span>
          </div>

          <Link
            to="/apply"
            className="bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-opacity"
          >
            Track a Job →
          </Link>
        </div>
      </div>

      {/* Pipeline */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map(({ status, label }) => (
          <PipelineColumn
            key={status}
            status={status}
            label={label}
            apps={grouped[status] ?? []}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Show closed toggle */}
      <div className="mt-4 flex items-center gap-2">
        <input
          id="show-closed"
          type="checkbox"
          checked={showClosed}
          onChange={(e) => setShowClosed(e.target.checked)}
          className="rounded border-gray-300 bg-white text-accent focus:ring-accent"
        />
        <label htmlFor="show-closed" className="text-gray-500 text-sm cursor-pointer select-none">
          Show rejected / withdrawn
        </label>
      </div>

      {/* ── Analytics section ── */}
      {stats && (
        <div className="mt-8 space-y-4">

          {/* Row 1: top-line numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Tailored Variants" value={stats.total_variants} sub="total created" />
            <StatCard
              label="Response Rate"
              value={stats.response_rate !== null ? `${stats.response_rate}%` : "—"}
              sub="applied → OA or beyond"
              valueColor={stats.response_rate !== null && stats.response_rate >= 30 ? "text-green-600" : "text-gray-700"}
            />
            <StatCard
              label="Skill Gaps"
              value={`${stats.skill_gap_summary.acquired}/${stats.skill_gap_summary.total}`}
              sub={`${stats.skill_gap_summary.learning} learning`}
              valueColor="text-indigo-600"
            />
            <StatCard
              label="AI Cost (this month)"
              value={`$${stats.ai_usage.estimated_cost_usd}`}
              sub={`${stats.ai_usage.tailor_runs_this_month} tailor runs`}
            />
          </div>

          {/* Row 2: funnel + score trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Application funnel */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">Application Funnel</p>
              <p className="text-gray-400 text-xs mb-4">Conversion from Applied through Offer</p>
              {stats.funnel.every((f) => f.count === 0) ? (
                <p className="text-gray-400 text-sm text-center py-8">Apply to jobs to see funnel data</p>
              ) : (
                <div className="space-y-2">
                  {stats.funnel.map((stage, i) => {
                    const maxCount = Math.max(...stats.funnel.map((s) => s.count), 1);
                    const STAGE_LABELS: Record<string, string> = {
                      applied: "Applied", oa_screen: "OA / Screen",
                      interview: "Interview", offer: "Offer",
                    };
                    const COLORS = ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981"];
                    return (
                      <div key={stage.stage} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 shrink-0">{STAGE_LABELS[stage.stage]}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                          <div
                            className="h-5 rounded-full transition-all"
                            style={{
                              width: `${(stage.count / maxCount) * 100}%`,
                              backgroundColor: COLORS[i],
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-6 text-right">{stage.count}</span>
                        {i > 0 && stats.funnel[i - 1].count > 0 && (
                          <span className="text-xs text-gray-400 w-10">
                            {Math.round((stage.count / stats.funnel[i - 1].count) * 100)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ATS score trend */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">ATS Score Trend</p>
              <p className="text-gray-400 text-xs mb-4">Score progression across tailored variants</p>
              {stats.score_trend.length < 2 ? (
                <p className="text-gray-400 text-sm text-center py-8">Score 2+ variants to see trend</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={stats.score_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="company" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} width={28} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v) => [`${v}`, "ATS Score"]}
                    />
                    <Line
                      type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Row 3: Most demanded skills + ATS score breakdown bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Most demanded skills from JDs */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">Most Demanded Skills</p>
              <p className="text-gray-400 text-xs mb-4">Skills appearing most often across all your job descriptions</p>
              {stats.most_demanded_skills.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Add JDs to jobs in Applications to see skill demand</p>
              ) : (
                <div className="space-y-2">
                  {stats.most_demanded_skills.slice(0, 10).map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-gray-600 text-xs w-28 shrink-0 truncate capitalize">{s.skill}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${s.pct >= 70 ? "bg-indigo-500" : s.pct >= 40 ? "bg-indigo-400" : "bg-indigo-300"}`}
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right shrink-0">{s.pct}% of JDs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ATS score dimensions — compact horizontal bars */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">ATS Score Breakdown</p>
              <p className="text-gray-400 text-xs mb-4">Average across all scored variants — your weakest dimensions</p>
              {stats.total_scores === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Score a variant to see breakdown</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Keywords", key: "keyword_match" },
                    { label: "Relevance", key: "semantic_relevance" },
                    { label: "Formatting", key: "formatting" },
                    { label: "Action Verbs", key: "action_verbs" },
                    { label: "Quantification", key: "quantification" },
                    { label: "Seniority", key: "seniority_match" },
                  ].sort((a, b) => (stats.breakdown_avg[a.key] ?? 0) - (stats.breakdown_avg[b.key] ?? 0))
                   .map(({ label, key }) => {
                    const v = stats.breakdown_avg[key] ?? 0;
                    const color = v >= 70 ? "bg-green-500" : v >= 50 ? "bg-yellow-500" : "bg-red-500";
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-gray-600 text-xs w-24 shrink-0">{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className={`${color} h-2 rounded-full`} style={{ width: `${v}%` }} />
                        </div>
                        <span className={`text-xs font-medium w-8 text-right shrink-0 ${v >= 70 ? "text-green-600" : v >= 50 ? "text-yellow-600" : "text-red-600"}`}>{v}</span>
                      </div>
                    );
                  })}
                  <p className="text-gray-300 text-xs text-right">Sorted weakest first</p>
                </div>
              )}
            </div>
          </div>

          {/* Row 4: velocity + skill readiness + activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Application velocity — big number if ≤1 week, chart otherwise */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">Application Velocity</p>
              <p className="text-gray-400 text-xs mb-4">Jobs added per week</p>
              {stats.weekly_velocity.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No data yet</p>
              ) : stats.weekly_velocity.length === 1 ? (
                <div className="flex flex-col items-center justify-center py-4 gap-1">
                  <span className="text-4xl font-bold text-indigo-600">{stats.weekly_velocity[0].count}</span>
                  <span className="text-gray-500 text-sm">jobs this week</span>
                  <span className="text-gray-300 text-xs mt-1">Check back next week to see trends</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={stats.weekly_velocity} barSize={20}>
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} width={20} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Skill readiness */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-1">Skill Readiness</p>
              <p className="text-gray-400 text-xs mb-3">Track gaps identified via Skill Gaps analysis</p>
              {stats.skill_gap_summary.total === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm mb-2">No gaps tracked yet</p>
                  <p className="text-gray-300 text-xs">Go to an application → Skill Gaps tab → Analyze</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[
                    { label: "Acquired ✓", key: "acquired", color: "bg-green-500", textColor: "text-green-600" },
                    { label: "Learning", key: "learning", color: "bg-blue-400", textColor: "text-blue-600" },
                    { label: "To address", key: "identified", color: "bg-amber-400", textColor: "text-amber-600" },
                    { label: "Skipping", key: "not_pursuing", color: "bg-gray-200", textColor: "text-gray-400" },
                  ].map(({ label, key, color, textColor }) => {
                    const count = stats.skill_gap_summary[key as keyof typeof stats.skill_gap_summary] as number;
                    const pct = Math.round((count / stats.skill_gap_summary.total) * 100);
                    return (
                      <div key={key}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-600">{label}</span>
                          <span className={`text-xs font-semibold ${textColor}`}>{count}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5">
                          <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-gray-300 text-xs text-right pt-1">{stats.skill_gap_summary.total} total gaps tracked</p>
                </div>
              )}
            </div>

            {/* Recent activity — enriched */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-gray-700 text-sm font-semibold mb-4">Recent Activity</p>
              {stats.recent_activity.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.recent_activity.map((item, i) => {
                    const ACTION_ICONS: Record<string, string> = {
                      tailored: "✦", ai_call: "◆", security_block: "⚠", tailoring: "↻",
                    };
                    const icon = ACTION_ICONS[item.action] ?? "·";
                    const actionLabel = item.action === "tailored" ? "Tailored" : item.action.replace(/_/g, " ");
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="text-indigo-400 text-xs shrink-0 mt-0.5">{icon}</span>
                        <div className="min-w-0">
                          <p className="text-gray-800 text-xs font-medium">
                            {actionLabel}
                            {item.label && <span className="text-gray-500 font-normal"> · {item.label}</span>}
                          </p>
                          <p className="text-gray-400 text-xs">
                            {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
