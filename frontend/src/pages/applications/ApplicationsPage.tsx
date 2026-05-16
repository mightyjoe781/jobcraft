import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as appApi from "../../api/applications";
import type { Application, AppStatus } from "../../api/applications";
import { STATUS_LABELS, STATUS_ORDER } from "../../api/applications";
import { updateJob } from "../../api/tailor";

const STATUS_COLORS: Record<AppStatus, string> = {
  saved:      "bg-gray-800 text-gray-400",
  tailoring:  "bg-indigo-900/40 text-indigo-400",
  applied:    "bg-blue-900/40 text-blue-400",
  oa_screen:  "bg-yellow-900/40 text-yellow-400",
  interview:  "bg-orange-900/40 text-orange-400",
  offer:      "bg-green-900/40 text-green-400",
  rejected:   "bg-red-900/40 text-red-400",
  withdrawn:  "bg-gray-800 text-gray-500",
};

function AtsScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-600 text-xs">—</span>;
  const color = score >= 70 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-medium ${color}`}>{score}</span>;
}

function StatusSelect({
  value,
  onChange,
}: {
  value: AppStatus;
  onChange: (s: AppStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AppStatus)}
      onClick={(e) => e.stopPropagation()}
      className={`text-xs rounded-lg px-2 py-1 border-0 cursor-pointer focus:ring-1 focus:ring-accent ${STATUS_COLORS[value]}`}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${color}`}>
      <span className="font-semibold">{count}</span>
      <span>{label}</span>
    </div>
  );
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<appApi.ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editJd, setEditJd] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);
  const [savingJd, setSavingJd] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    const [a, s] = await Promise.all([appApi.listApplications(), appApi.getStats()]);
    setApps(a);
    setStats(s);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleStatusChange(id: string, status: AppStatus) {
    const updated = await appApi.updateApplication(id, { status });
    setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    if (stats) {
      const fresh = await appApi.getStats();
      setStats(fresh);
    }
  }

  async function handleSaveNotes(id: string) {
    setSavingNotes(id);
    const updated = await appApi.updateApplication(id, { notes: editNotes[id] ?? "" });
    setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setSavingNotes(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this job from tracking?")) return;
    try {
      await appApi.deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
      setExpandedId(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Failed to delete: ${e.message ?? "unknown error"}`);
    }
  }

  async function handleSaveJd(app: Application) {
    setSavingJd(app.id);
    try {
      await updateJob(app.job_id, { jd_text: editJd[app.id] ?? "" });
      setApps((prev) =>
        prev.map((a) => a.id === app.id ? { ...a, jd_text: editJd[app.id] ?? "" } : a)
      );
    } catch {
      alert("Failed to save job description");
    } finally {
      setSavingJd(null);
    }
  }

  function toggleExpand(id: string, app: Application) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setEditNotes((prev) => ({ ...prev, [id]: app.notes ?? "" }));
      setEditJd((prev) => ({ ...prev, [id]: app.jd_text ?? "" }));
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  const activeCount = apps.filter(
    (a) => !["rejected", "withdrawn", "offer"].includes(a.status)
  ).length;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Applications</h1>
          <p className="text-gray-400 text-sm">
            Every job you've tailored a resume for, tracked automatically.
          </p>
        </div>
        {stats && stats.total > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            <StatPill label="active" count={activeCount} color="bg-indigo-900/30 text-indigo-400" />
            <StatPill label="interview" count={stats.by_status.interview ?? 0} color="bg-orange-900/30 text-orange-400" />
            <StatPill label="offer" count={stats.by_status.offer ?? 0} color="bg-green-900/30 text-green-400" />
            <StatPill label="rejected" count={stats.by_status.rejected ?? 0} color="bg-red-900/30 text-red-400" />
          </div>
        )}
      </div>

      {apps.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-gray-500 mb-2">No jobs tracked yet.</p>
          <p className="text-gray-600 text-sm mb-6">
            Tailor a resume for a job — it appears here automatically.
          </p>
          <button
            onClick={() => navigate("/tailor")}
            className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-5 py-2.5 transition-colors"
          >
            Tailor a resume
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => {
            const expanded = expandedId === app.id;
            return (
              <div
                key={app.id}
                className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-800/40 transition-colors"
                  onClick={() => toggleExpand(app.id, app)}
                >
                  {/* Company + role */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{app.company}</p>
                    <p className="text-gray-400 text-xs truncate">{app.role_title}</p>
                  </div>

                  {/* Status dropdown */}
                  <StatusSelect
                    value={app.status}
                    onChange={(s) => handleStatusChange(app.id, s)}
                  />

                  {/* ATS score */}
                  <div className="w-12 text-center">
                    <p className="text-gray-600 text-xs mb-0.5">ATS</p>
                    <AtsScoreBadge score={app.ats_score} />
                  </div>

                  {/* Variant count */}
                  <div className="w-16 text-center hidden sm:block">
                    <p className="text-gray-600 text-xs mb-0.5">Variants</p>
                    <p className="text-gray-300 text-xs">{app.variant_count}</p>
                  </div>

                  {/* Date */}
                  <div className="text-gray-500 text-xs hidden md:block w-20 text-right">
                    {new Date(app.created_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric",
                    })}
                  </div>

                  {/* Chevron */}
                  <span className="text-gray-600 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-gray-800 px-5 py-4 space-y-4 bg-gray-900/60">
                    <div className="flex flex-wrap gap-3">
                      {app.variant_id && (
                        <button
                          onClick={() => navigate(`/resumes?tab=variants`)}
                          className="text-xs text-accent hover:underline"
                        >
                          View tailored variant →
                        </button>
                      )}
                      {app.variant_id && (
                        <button
                          onClick={() => navigate(`/analyze?variant=${app.variant_id}`)}
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          Score / analyze →
                        </button>
                      )}
                      {app.jd_url && (
                        <a
                          href={app.jd_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          View job posting ↗
                        </a>
                      )}
                    </div>

                    {/* Status quick-set row */}
                    <div className="flex gap-2 flex-wrap">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(app.id, s)}
                          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                            app.status === s
                              ? STATUS_COLORS[s] + " ring-1 ring-current"
                              : "bg-gray-800 text-gray-500 hover:text-white"
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>

                    {/* Job Description */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-gray-500">Job Description</label>
                        {app.jd_url && (
                          <a
                            href={app.jd_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            View original ↗
                          </a>
                        )}
                      </div>
                      <textarea
                        value={editJd[app.id] ?? ""}
                        onChange={(e) =>
                          setEditJd((prev) => ({ ...prev, [app.id]: e.target.value }))
                        }
                        rows={5}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-y focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="Paste the full job description here — used for ATS scoring and skill gap analysis…"
                      />
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => void handleSaveJd(app)}
                          disabled={savingJd === app.id}
                          className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-3 py-1 transition-colors"
                        >
                          {savingJd === app.id ? "Saving…" : "Save JD"}
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">Notes</label>
                      <textarea
                        value={editNotes[app.id] ?? ""}
                        onChange={(e) =>
                          setEditNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                        }
                        rows={2}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="Add notes, recruiter contact, next steps…"
                      />
                      <div className="flex justify-between mt-1.5">
                        <button
                          onClick={() => void handleDelete(app.id)}
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                        >
                          Remove from tracking
                        </button>
                        <button
                          onClick={() => handleSaveNotes(app.id)}
                          disabled={savingNotes === app.id}
                          className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-3 py-1 transition-colors"
                        >
                          {savingNotes === app.id ? "Saving…" : "Save notes"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
