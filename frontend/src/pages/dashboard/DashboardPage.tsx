import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
        {apps.map((app) => (
          <JobCard key={app.id} app={app} onDragStart={onDragStart} />
        ))}
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
          Apply to your first job →
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
            Apply to a Job →
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
            Apply to a Job →
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

      {/* ── Stats section ── */}
      {stats && (
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Tailored Variants"
            value={stats.total_variants}
            sub="total resume variants created"
          />
          <StatCard
            label="Avg ATS Score"
            value={stats.avg_ats_score ?? "—"}
            sub={`across ${stats.total_scores} scored resume${stats.total_scores !== 1 ? "s" : ""}`}
            valueColor={
              stats.avg_ats_score === null ? "text-gray-400" :
              stats.avg_ats_score >= 70 ? "text-green-600" :
              stats.avg_ats_score >= 50 ? "text-yellow-600" : "text-red-600"
            }
          />
          <StatCard
            label="Skill Gaps"
            value={stats.skill_gap_summary.total}
            sub={`${stats.skill_gap_summary.acquired} acquired · ${stats.skill_gap_summary.learning} learning`}
            valueColor="text-blue-600"
          />
          <StatCard
            label="AI Cost (this month)"
            value={`$${stats.ai_usage.estimated_cost_usd}`}
            sub={`${stats.ai_usage.tailor_runs_this_month} tailor run${stats.ai_usage.tailor_runs_this_month !== 1 ? "s" : ""}`}
          />
        </div>
      )}

      {/* ── Recent activity ── */}
      {stats && stats.recent_activity.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-4">Recent Activity</p>
          <div className="space-y-2.5">
            {stats.recent_activity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                <div className="flex-1">
                  <span className="text-gray-900 capitalize">{item.action.replace(/_/g, " ")}</span>
                  <span className="text-gray-400 ml-2 text-xs">
                    {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
