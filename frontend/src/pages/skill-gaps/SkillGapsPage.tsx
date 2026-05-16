import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as skillGapApi from "../../api/skillGaps";
import * as tailorApi from "../../api/tailor";
import * as resumeApi from "../../api/resumes";
import type { SkillGap, GapStatus, GapCategory } from "../../api/skillGaps";
import type { Job } from "../../api/tailor";
import type { BaseResume } from "../../api/resumes";

const CATEGORY_LABELS: Record<GapCategory, string> = {
  hard_skill: "Hard Skills",
  tool: "Tools & Frameworks",
  domain: "Domain Knowledge",
  seniority: "Seniority Signals",
};

const CATEGORY_ORDER: GapCategory[] = ["hard_skill", "tool", "domain", "seniority"];

const STATUS_OPTIONS: { value: GapStatus; label: string; color: string }[] = [
  { value: "identified", label: "Identified", color: "text-gray-400 bg-gray-800" },
  { value: "learning", label: "Learning", color: "text-blue-400 bg-blue-900/30" },
  { value: "acquired", label: "Acquired", color: "text-green-400 bg-green-900/30" },
  { value: "not_pursuing", label: "Not pursuing", color: "text-gray-600 bg-gray-900" },
];

function PriorityBadge({ priority }: { priority: number }) {
  const color =
    priority >= 8 ? "bg-red-900/40 text-red-400" :
    priority >= 5 ? "bg-yellow-900/40 text-yellow-400" :
    "bg-gray-800 text-gray-500";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${color}`}>
      P{priority}
    </span>
  );
}

function StatusToggle({ gap, onUpdate }: { gap: SkillGap; onUpdate: (g: SkillGap) => void }) {
  const [loading, setLoading] = useState(false);
  const current = STATUS_OPTIONS.find((s) => s.value === gap.status) ?? STATUS_OPTIONS[0];

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLoading(true);
    try {
      const updated = await skillGapApi.updateGapStatus(gap.id, e.target.value as GapStatus);
      onUpdate(updated);
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={gap.status}
      onChange={handleChange}
      disabled={loading}
      className={`text-xs rounded-lg px-2 py-1 border-0 focus:ring-1 focus:ring-accent cursor-pointer ${current.color}`}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

function GapCard({ gap, onUpdate }: { gap: SkillGap; onUpdate: (g: SkillGap) => void }) {
  const dimmed = gap.status === "not_pursuing" || gap.status === "acquired";
  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2 transition-opacity ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <PriorityBadge priority={gap.priority} />
          <span className="text-white font-medium truncate">{gap.skill_name}</span>
        </div>
        <StatusToggle gap={gap} onUpdate={onUpdate} />
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{gap.why_it_matters}</p>
      <div className="flex items-start gap-1.5 text-xs text-indigo-400">
        <span className="shrink-0 mt-0.5">→</span>
        <span>{gap.suggested_resource}</span>
      </div>
    </div>
  );
}

export default function SkillGapsPage() {
  const [searchParams] = useSearchParams();
  const preselectedJobId = searchParams.get("job_id");
  const preselectedResumeId = searchParams.get("resume_id");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [bases, setBases] = useState<BaseResume[]>([]);
  const [jobId, setJobId] = useState(preselectedJobId ?? "");
  const [baseId, setBaseId] = useState(preselectedResumeId ?? "");
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([tailorApi.listJobs(), resumeApi.listBaseResumes()]).then(
      ([j, b]) => {
        setJobs(j);
        setBases(b);
        if (!jobId && j.length) setJobId(j[0].id);
        if (!baseId && b.length) setBaseId(b[0].id);
      }
    );
  }, []);

  // If pre-selected job provided, load existing gaps for it
  useEffect(() => {
    if (preselectedJobId) {
      skillGapApi.listGaps(preselectedJobId).then((g) => {
        if (g.length) { setGaps(g); setHasAnalyzed(true); }
      });
    }
  }, [preselectedJobId]);

  function updateGap(updated: SkillGap) {
    setGaps((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  }

  async function handleAnalyze() {
    if (!jobId || !baseId) return;
    setError(null);
    setAnalyzing(true);
    try {
      const result = await skillGapApi.analyzeGaps(jobId, baseId);
      setGaps(result);
      setHasAnalyzed(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // Group gaps by category, active (not acquired/not_pursuing) first
  const grouped = CATEGORY_ORDER.reduce<Record<GapCategory, SkillGap[]>>(
    (acc, cat) => {
      acc[cat] = gaps
        .filter((g) => g.category === cat)
        .sort((a, b) => b.priority - a.priority);
      return acc;
    },
    { hard_skill: [], tool: [], domain: [], seniority: [] }
  );

  const activeCount = gaps.filter(
    (g) => g.status !== "acquired" && g.status !== "not_pursuing"
  ).length;
  const acquiredCount = gaps.filter((g) => g.status === "acquired").length;

  const selectedJob = jobs.find((j) => j.id === jobId);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">Skill Gap Analysis</h1>
      <p className="text-gray-400 text-sm mb-8">
        Discover what skills a target role requires that your resume doesn't yet show.
        Track your learning progress as you close each gap.
      </p>

      {/* Analysis form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
        <h2 className="text-white font-medium mb-4 text-sm">
          {hasAnalyzed ? "Re-analyze" : "Choose a job and resume"}
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Job</label>
            <select
              value={jobId}
              onChange={(e) => { setJobId(e.target.value); setHasAnalyzed(false); setGaps([]); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {jobs.length === 0 && <option value="">No jobs yet</option>}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.company} — {j.role_title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Base resume</label>
            <select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {bases.length === 0 && <option value="">No resumes yet</option>}
              {bases.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        <button
          onClick={handleAnalyze}
          disabled={analyzing || !jobId || !baseId}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
        >
          {analyzing ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing…
            </span>
          ) : hasAnalyzed ? "Re-analyze" : "Analyze gaps"}
        </button>
      </div>

      {/* Results */}
      {hasAnalyzed && gaps.length === 0 && !analyzing && (
        <div className="text-center py-12">
          <p className="text-green-400 font-medium mb-1">No significant gaps found</p>
          <p className="text-gray-500 text-sm">
            Your resume is a strong match for {selectedJob?.role_title ?? "this role"}.
          </p>
        </div>
      )}

      {gaps.length > 0 && (
        <>
          {/* Progress summary */}
          <div className="flex items-center gap-6 mb-6 text-sm">
            <div>
              <span className="text-white font-semibold text-2xl">{gaps.length}</span>
              <span className="text-gray-500 ml-1.5">total gaps</span>
            </div>
            <div>
              <span className="text-blue-400 font-semibold text-2xl">{activeCount}</span>
              <span className="text-gray-500 ml-1.5">to address</span>
            </div>
            <div>
              <span className="text-green-400 font-semibold text-2xl">{acquiredCount}</span>
              <span className="text-gray-500 ml-1.5">acquired</span>
            </div>
            {gaps.length > 0 && (
              <div className="flex-1 bg-gray-800 rounded-full h-1.5 ml-2">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((acquiredCount / gaps.length) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Gap groups */}
          {CATEGORY_ORDER.map((cat) => {
            const catGaps = grouped[cat];
            if (!catGaps.length) return null;
            return (
              <div key={cat} className="mb-8">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  {CATEGORY_LABELS[cat]}
                  <span className="ml-2 text-gray-600 normal-case font-normal">
                    {catGaps.length} gap{catGaps.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="space-y-3">
                  {catGaps.map((g) => (
                    <GapCard key={g.id} gap={g} onUpdate={updateGap} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
