import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listApplications } from "../../api/applications";
import type { Application, AppStatus } from "../../api/applications";

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

function JobCard({ app }: { app: Application }) {
  return (
    <Link to="/applications">
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 mb-2 hover:border-gray-600 cursor-pointer">
        <p className="text-white text-sm font-medium truncate">{app.company}</p>
        <p className="text-gray-400 text-xs truncate">{app.role_title}</p>
        <div className="flex items-center gap-2 mt-2">
          {app.ats_score !== null && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                app.ats_score >= 70
                  ? "bg-green-900/40 text-green-400"
                  : app.ats_score >= 50
                  ? "bg-yellow-900/40 text-yellow-400"
                  : "bg-red-900/40 text-red-400"
              }`}
            >
              {app.ats_score}
            </span>
          )}
          <span className="text-gray-600 text-xs">{daysAgo(app.created_at)}d</span>
          {isOverdue(app.follow_up_date) && (
            <span className="text-red-400 text-xs">⚠</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function PipelineColumn({
  status,
  label,
  apps,
}: {
  status: AppStatus;
  label: string;
  apps: Application[];
}) {
  const isHighlight = status === "interview" || status === "offer";
  const isMuted = status === "rejected";

  return (
    <div
      className={`w-52 shrink-0 ${isMuted ? "opacity-60" : ""} ${
        isHighlight ? "border-l-2 border-accent pl-2" : ""
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-300 text-sm font-medium">{label}</span>
        <span className="bg-gray-800 text-gray-400 rounded-full px-2 text-xs py-0.5">
          {apps.length}
        </span>
      </div>

      {/* Cards */}
      <div>
        {apps.map((app) => (
          <JobCard key={app.id} app={app} />
        ))}
        {apps.length === 0 && (
          <div className="border border-dashed border-gray-800 rounded-lg h-16 flex items-center justify-center">
            <span className="text-gray-700 text-xs">Empty</span>
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
          <div className="h-5 bg-gray-800 rounded animate-pulse mb-3 w-24" />
          <div className="h-16 bg-gray-800 rounded-lg animate-pulse mb-2" />
          <div className="h-16 bg-gray-800 rounded-lg animate-pulse mb-2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-12 flex flex-col items-center text-center gap-4 max-w-sm w-full">
        <p className="text-2xl font-bold text-white">JobCraft</p>
        <p className="text-gray-400 text-base">Ready to land your next role?</p>
        <Link
          to="/apply"
          className="bg-accent hover:opacity-90 text-white font-semibold px-6 py-3 rounded-lg transition-opacity"
        >
          Apply to your first job →
        </Link>
        <p className="text-gray-600 text-sm">
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

  useEffect(() => {
    listApplications()
      .then(setApplications)
      .finally(() => setLoading(false));
  }, []);

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
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Your job search pipeline</p>
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
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Your job search pipeline</p>
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Your job search pipeline</p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Stats strip */}
          <div className="flex items-center gap-2">
            <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-full">
              Active&nbsp;
              <span className="font-semibold text-white">{activeCount}</span>
            </span>
            {avgAts !== null && (
              <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-full">
                Avg ATS&nbsp;
                <span
                  className={`font-semibold ${
                    avgAts >= 70
                      ? "text-green-400"
                      : avgAts >= 50
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {avgAts}
                </span>
              </span>
            )}
            <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-full">
              Interviews&nbsp;
              <span className="font-semibold text-white">{interviewCount}</span>
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
          className="rounded border-gray-600 bg-gray-800 text-accent focus:ring-accent"
        />
        <label htmlFor="show-closed" className="text-gray-500 text-sm cursor-pointer select-none">
          Show rejected / withdrawn
        </label>
      </div>
    </div>
  );
}
