import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as appApi from "../../api/applications";
import * as resumeApi from "../../api/resumes";
import * as atsApi from "../../api/ats";
import * as skillGapApi from "../../api/skillGaps";
import * as coverLetterApi from "../../api/coverLetters";
import { updateJob } from "../../api/tailor";
import type { Application, AppStatus } from "../../api/applications";
import type { Variant } from "../../api/resumes";
import type { AtsScore } from "../../api/ats";
import type { SkillGap, GapStatus } from "../../api/skillGaps";
import type { CoverLetter } from "../../api/coverLetters";
import { STATUS_LABELS, STATUS_ORDER } from "../../api/applications";
import { PdfViewer, PdfDownloadLink } from "../../components/PdfViewer";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AppStatus, string> = {
  saved:      "bg-gray-100 text-gray-500",
  tailoring:  "bg-indigo-50 text-indigo-600",
  applied:    "bg-blue-50 text-blue-600",
  oa_screen:  "bg-yellow-50 text-yellow-700",
  interview:  "bg-orange-50 text-orange-700",
  offer:      "bg-green-50 text-green-700",
  rejected:   "bg-red-50 text-red-700",
  withdrawn:  "bg-gray-100 text-gray-400",
};

function AtsScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 70 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  return <span className={`text-xs font-semibold ${color}`}>{score}</span>;
}

// ── Left panel: compact job list ───────────────────────────────────────────────

function JobListItem({
  app,
  selected,
  onClick,
}: {
  app: Application;
  selected: boolean;
  onClick: () => void;
}) {
  const isOverdue = app.follow_up_date && new Date(app.follow_up_date) < new Date();
  const daysOpen = Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86_400_000);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-200 transition-colors ${
        selected ? "bg-gray-50 border-l-2 border-l-accent" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <p className="text-gray-900 text-sm font-medium truncate">{app.company}</p>
        {isOverdue && <span className="text-red-500 text-xs shrink-0">⚠</span>}
      </div>
      <p className="text-gray-500 text-xs truncate mb-1.5">{app.role_title}</p>
      <div className="flex items-center justify-between">
        <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[app.status]}`}>
          {STATUS_LABELS[app.status]}
        </span>
        <span className="text-gray-400 text-xs">{daysOpen}d</span>
      </div>
    </button>
  );
}

// ── Right panel tabs ───────────────────────────────────────────────────────────

type TabId = "variants" | "ats" | "cover" | "gaps" | "details";

const TABS: { id: TabId; label: string }[] = [
  { id: "variants", label: "Variants & Scores" },
  { id: "cover", label: "Cover Letter" },
  { id: "gaps", label: "Skill Gaps" },
  { id: "details", label: "Details" },
];

// ── Variants tab ───────────────────────────────────────────────────────────────

const BREAKDOWN_LABELS: Record<string, string> = {
  keyword_match: "Keywords", semantic_relevance: "Relevance",
  formatting: "Formatting", action_verbs: "Action Verbs",
  quantification: "Quantification", seniority_match: "Seniority",
};

function AtsDetailsPanel({ score }: { score: AtsScore }) {
  if (score.status === "pending") return (
    <div className="flex items-center gap-2 text-gray-500 text-xs p-3">
      <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
      Scoring… (~30s)
    </div>
  );
  if (score.status === "failed") return <p className="text-red-500 text-xs p-3">{score.error_message}</p>;
  const s = score.overall_score ?? 0;
  const color = s >= 70 ? "text-green-600" : s >= 50 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-2 space-y-3">
      <div className="flex items-center gap-3">
        <span className={`text-2xl font-bold ${color}`}>{s}</span>
        <span className="text-gray-500 text-xs">
          {s >= 70 ? "Strong match" : s >= 50 ? "Moderate match" : "Needs improvement"}
        </span>
      </div>
      {score.breakdown && (
        <div className="space-y-1.5">
          {Object.entries(score.breakdown).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-gray-500 text-xs w-28 shrink-0">{BREAKDOWN_LABELS[k] ?? k}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${(v as number) >= 70 ? "bg-green-500" : (v as number) >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${v}%` }} />
              </div>
              <span className="text-xs text-gray-600 w-6 text-right">{v as number}</span>
            </div>
          ))}
        </div>
      )}
      {score.missing_keywords && score.missing_keywords.length > 0 && (
        <div>
          <p className="text-gray-400 text-xs mb-1.5">Missing keywords</p>
          <div className="flex flex-wrap gap-1">
            {score.missing_keywords.slice(0, 6).map((k, i) => (
              <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${k.priority === "high" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                {k.term}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantRow({
  v, app, onAppUpdate, onDelete, onFork, onPreview, onScored,
}: {
  v: Variant;
  app: Application;
  onAppUpdate: (a: Application) => void;
  onDelete: (id: string) => void;
  onFork: (v: Variant) => void;
  onPreview: (id: string) => void;
  onScored: (variantId: string, score: number) => void;
}) {
  const [score, setScore] = useState<AtsScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [loadingStored, setLoadingStored] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = app.variant_id === v.id;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // When user expands, try to load the stored score from DB first
  async function handleToggleDetails() {
    if (showDetails) { setShowDetails(false); return; }
    setShowDetails(true);
    if (score) return; // already loaded in this session
    setLoadingStored(true);
    try {
      const stored = await atsApi.getVariantStoredScore(v.id);
      if (stored) setScore(stored);
    } finally {
      setLoadingStored(false);
    }
  }

  async function handleScore() {
    setScoring(true);
    setShowDetails(true);
    try {
      const result = await atsApi.submitVariantScore(v.id);
      if ("score_id" in result) {
        const pending: AtsScore = { id: result.score_id, status: "pending", overall_score: null, breakdown: null, missing_keywords: null, suggestions: null, error_message: null, created_at: new Date().toISOString() };
        setScore(pending);
        pollRef.current = setInterval(async () => {
          const s = await atsApi.getScore(result.score_id);
          if (s.status !== "pending") {
            setScore(s);
            if (s.overall_score !== null) onScored(v.id, s.overall_score);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }, 2000);
      } else {
        const s = result as AtsScore;
        setScore(s);
        if (s.overall_score !== null) onScored(v.id, s.overall_score);
      }
    } finally { setScoring(false); }
  }

  async function handleSetActive() {
    const updated = await appApi.updateApplication(app.id, {
      resume_variant_id: v.id,
    } as Parameters<typeof appApi.updateApplication>[1]);
    onAppUpdate(updated);
  }

  const storedScore = v.ats_score;
  const scoreColor = storedScore !== null
    ? storedScore >= 70 ? "text-green-600" : storedScore >= 50 ? "text-yellow-600" : "text-red-600"
    : "text-gray-400";

  return (
    <div className={`bg-white rounded-xl border shadow-sm ${isActive ? "border-indigo-300" : "border-gray-200"}`}>
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Left: active badge + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isActive && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">Active</span>}
            <span className="text-gray-500 text-xs">
              {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* ATS score + view/score button */}
        <div className="flex items-center gap-2 shrink-0">
          {storedScore !== null ? (
            <button onClick={() => void handleToggleDetails()}
              className={`text-sm font-bold ${scoreColor} hover:opacity-80 transition-opacity`}
              title="Click to view ATS breakdown">
              {storedScore}
              <span className="text-gray-400 text-xs font-normal ml-1">ATS {showDetails ? "▲" : "▼"}</span>
            </button>
          ) : (
            <button onClick={() => void handleScore()} disabled={scoring}
              className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
              {scoring ? "Scoring…" : "Score ATS"}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <button onClick={() => onPreview(v.id)} className="text-indigo-600 hover:underline">Preview</button>
          <PdfDownloadLink apiPath={resumeApi.variantPdfUrl(v.id)} filename={`${app.company}-${app.role_title}.pdf`}
            className="text-gray-500 hover:text-gray-900">Download</PdfDownloadLink>
          {!isActive && (
            <button onClick={() => void handleSetActive()} className="text-gray-500 hover:text-gray-900">Set active</button>
          )}
          <button onClick={() => onFork(v)} className="text-gray-500 hover:text-gray-900">Fork</button>
          <button onClick={() => onDelete(v.id)} className="text-gray-400 hover:text-red-600">Delete</button>
        </div>
      </div>

      {/* ATS details panel (shown = score exists or score clicked) */}
      {showDetails && (
        <div className="px-4 pb-4">
          {loadingStored ? (
            <div className="flex items-center gap-2 text-gray-400 text-xs p-3">
              <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
              Loading stored results…
            </div>
          ) : score ? (
            <div>
              <AtsDetailsPanel score={score} />
              <button onClick={() => void handleScore()} disabled={scoring}
                className="text-xs text-gray-400 hover:text-indigo-600 mt-2 transition-colors">
                {scoring ? "Re-scoring…" : "↻ Re-score"}
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-gray-500 text-sm mb-2">No ATS score yet</p>
              <button onClick={() => void handleScore()} disabled={scoring}
                className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                {scoring ? "Scoring…" : "Score this variant"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariantsTab({
  app,
  onAppUpdate,
}: {
  app: Application;
  onAppUpdate: (a: Application) => void;
}) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    resumeApi.listVariants(app.job_id).then(setVariants).finally(() => setLoading(false));
  }, [app.job_id]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this variant?")) return;
    try {
      await resumeApi.deleteVariant(id);
      setVariants((prev) => prev.filter((v) => v.id !== id));
    } catch { alert("Delete failed"); }
  }

  async function handleFork(v: Variant) {
    const label = prompt("Label for new base resume:", `${app.company} fork`);
    if (!label) return;
    try {
      const diff = await resumeApi.getVariantDiff(v.id);
      await resumeApi.createBaseResume({ label, source_type: "forked_variant", source_variant_id: v.id, tex_source: diff.modified_tex });
      alert(`Forked as "${label}" — now in My Resumes`);
    } catch { alert("Fork failed"); }
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading variants…</div>;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-sm">{variants.length} variant{variants.length !== 1 ? "s" : ""} for this job</p>
        <button onClick={() => navigate(`/apply?job_id=${app.job_id}`)}
          className="text-xs bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-1.5 transition-colors">
          + Tailor new variant
        </button>
      </div>

      {variants.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <p className="text-gray-400 text-sm mb-3">No variants yet</p>
          <button onClick={() => navigate(`/apply?job_id=${app.job_id}`)} className="text-accent text-sm hover:underline">
            Tailor a resume for this job →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <VariantRow key={v.id} v={v} app={app} onAppUpdate={onAppUpdate}
              onDelete={handleDelete} onFork={handleFork} onPreview={setPreviewId}
              onScored={(id, score) => setVariants((prev) => prev.map((x) => x.id === id ? { ...x, ats_score: score } : x))} />
          ))}
        </div>
      )}

      {previewId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
              <span className="text-gray-900 text-sm font-medium">Preview</span>
              <div className="flex items-center gap-3">
                <PdfDownloadLink
                  apiPath={resumeApi.variantPdfUrl(previewId)}
                  filename={`${app.company}-variant.pdf`}
                  className="text-xs text-accent hover:underline"
                >
                  Download
                </PdfDownloadLink>
                <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
              </div>
            </div>
            <PdfViewer apiPath={resumeApi.variantPdfUrl(previewId)} className="flex-1 min-h-[70vh] rounded-b-xl" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── ATS tab ────────────────────────────────────────────────────────────────────


// ── Cover Letter tab ───────────────────────────────────────────────────────────

function CoverLetterTab({ app }: { app: Application }) {
  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [generating, setGenerating] = useState(false);
  const [tone, setTone] = useState<"formal" | "conversational" | "enthusiastic">("formal");
  const [activeText, setActiveText] = useState("");
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    coverLetterApi.listCoverLetters().then((all) => {
      const forJob = all.filter((cl) => cl.job_id === app.job_id);
      setLetters(forJob);
      if (forJob.length > 0) { setActiveText(forJob[0].body_text); setActiveLetterId(forJob[0].id); }
    });
  }, [app.job_id]);

  const [genError, setGenError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!app.jd_text?.trim()) {
      setGenError("Add a job description in the Details tab first — it's needed to generate a relevant cover letter.");
      return;
    }
    setGenError(null);
    setGenerating(true);
    setActiveText("");
    setActiveLetterId(null);
    try {
      let accumulated = "";
      for await (const event of coverLetterApi.streamGenerate({
        job_id: app.job_id,
        resume_variant_id: app.variant_id ?? undefined,
        tone,
      })) {
        if (event.type === "id") setActiveLetterId(event.data.cover_letter_id);
        else if (event.type === "chunk") { accumulated += event.data.text ?? ""; setActiveText(accumulated); }
        else if (event.type === "error") { setGenError(event.data.message ?? "Generation failed"); break; }
        else if (event.type === "done") {
          const fresh = await coverLetterApi.listCoverLetters();
          setLetters(fresh.filter((cl) => cl.job_id === app.job_id));
        }
      }
    } catch (err: unknown) {
      setGenError((err as { message?: string }).message ?? "Generation failed");
    } finally { setGenerating(false); }
  }

  return (
    <div className="p-5 space-y-4">
      {genError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {genError}
        </div>
      )}
      <div className="flex items-center gap-3">
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value as typeof tone)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="formal">Formal</option>
          <option value="conversational">Conversational</option>
          <option value="enthusiastic">Enthusiastic</option>
        </select>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="text-sm bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors"
        >
          {generating ? "Writing…" : letters.length > 0 ? "Regenerate" : "Generate"}
        </button>
        {activeLetterId && (
          <>
            <button
              onClick={async () => { setSaving(true); try { await coverLetterApi.updateCoverLetter(activeLetterId, activeText); } finally { setSaving(false); } }}
              disabled={saving}
              className="text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 rounded-lg px-3 py-2"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={async () => { await navigator.clipboard.writeText(activeText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <PdfDownloadLink
              apiPath={coverLetterApi.coverLetterPdfPath(activeLetterId)}
              filename={`cover-letter-${app.company}.pdf`}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Export PDF
            </PdfDownloadLink>
          </>
        )}
      </div>

      {(activeText || generating) && (
        <textarea
          value={activeText}
          onChange={(e) => setActiveText(e.target.value)}
          disabled={generating}
          rows={14}
          className="w-full bg-white border border-gray-200 rounded-xl px-5 py-4 text-gray-900 text-sm leading-7 resize-y focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-70"
          style={{ fontFamily: "Georgia, serif" }}
          placeholder="Cover letter will appear here…"
        />
      )}

      {!activeText && !generating && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <p className="text-gray-400 text-sm">No cover letter yet — click Generate to create one.</p>
        </div>
      )}
    </div>
  );
}

// ── Skill Gaps tab ─────────────────────────────────────────────────────────────

function SkillGapsTab({ app }: { app: Application }) {
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [bases, setBases] = useState<{ id: string; label: string }[]>([]);
  const [baseId, setBaseId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    skillGapApi.listGaps(app.job_id).then(setGaps);
    resumeApi.listBaseResumes().then((r) => { setBases(r); if (r.length) setBaseId(r[0].id); });
  }, [app.job_id]);

  const CATEGORY_LABELS: Record<string, string> = {
    hard_skill: "Hard Skills", tool: "Tools & Frameworks", domain: "Domain Knowledge", seniority: "Seniority Signals",
  };

  const GAP_STATUS_COLORS: Record<GapStatus, string> = {
    identified: "text-gray-500 bg-gray-100",
    learning: "text-blue-600 bg-blue-50",
    acquired: "text-green-600 bg-green-50",
    not_pursuing: "text-gray-400 bg-gray-50",
  };

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <select
          value={baseId}
          onChange={(e) => setBaseId(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <button
          onClick={async () => {
            if (!baseId || !app.jd_text) return;
            setAnalyzing(true);
            try { setGaps(await skillGapApi.analyzeGaps(app.job_id, baseId)); }
            finally { setAnalyzing(false); }
          }}
          disabled={analyzing || !baseId || !app.jd_text}
          className="text-sm bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors"
        >
          {analyzing ? "Analyzing…" : gaps.length > 0 ? "Re-analyze" : "Analyze gaps"}
        </button>
        {!app.jd_text && <p className="text-gray-400 text-xs">Add a JD in Details first</p>}
      </div>

      {gaps.length === 0 && !analyzing && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <p className="text-gray-400 text-sm">No gap analysis yet.</p>
        </div>
      )}

      {["hard_skill", "tool", "domain", "seniority"].map((cat) => {
        const catGaps = gaps.filter((g) => g.category === cat).sort((a, b) => b.priority - a.priority);
        if (!catGaps.length) return null;
        return (
          <div key={cat}>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
            <div className="space-y-2">
              {catGaps.map((g) => (
                <div key={g.id} className={`flex items-start gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm ${g.status === "acquired" || g.status === "not_pursuing" ? "opacity-50" : ""}`}>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${g.priority >= 8 ? "bg-red-50 text-red-700" : g.priority >= 5 ? "bg-yellow-50 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                    P{g.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm font-medium">{g.skill_name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{g.suggested_resource}</p>
                  </div>
                  <select
                    value={g.status}
                    onChange={async (e) => {
                      const updated = await skillGapApi.updateGapStatus(g.id, e.target.value as GapStatus);
                      setGaps((prev) => prev.map((x) => x.id === g.id ? updated : x));
                    }}
                    className={`text-xs rounded px-1.5 py-0.5 border-0 cursor-pointer shrink-0 ${GAP_STATUS_COLORS[g.status]}`}
                  >
                    <option value="identified">Identified</option>
                    <option value="learning">Learning</option>
                    <option value="acquired">Acquired</option>
                    <option value="not_pursuing">Skip</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Details tab ────────────────────────────────────────────────────────────────

function DetailsTab({
  app,
  onUpdate,
  onDelete,
}: {
  app: Application;
  onUpdate: (a: Application) => void;
  onDelete: (id: string) => void;
}) {
  const [jdText, setJdText] = useState(app.jd_text ?? "");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [referral, setReferral] = useState(app.referral_contact ?? "");
  const [followUp, setFollowUp] = useState(app.follow_up_date ?? "");
  const [savingJd, setSavingJd] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Sync when app changes (different job selected)
  useEffect(() => {
    setJdText(app.jd_text ?? "");
    setNotes(app.notes ?? "");
    setReferral(app.referral_contact ?? "");
    setFollowUp(app.follow_up_date ?? "");
  }, [app.id]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      // Don't propagate to parent — notes/referral/followup aren't shown
      // in the job list, so no need to re-render the whole panel (avoids flicker)
      await appApi.updateApplication(app.id, {
        notes, referral_contact: referral, follow_up_date: followUp || undefined,
      });
    } finally { setSavingNotes(false); }
  }

  async function saveJd() {
    setSavingJd(true);
    try { await updateJob(app.job_id, { jd_text: jdText }); }
    finally { setSavingJd(false); }
  }

  const INPUT = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-400 transition-colors";

  return (
    <div className="p-5 space-y-5">
      {/* Status — segmented selector with matching colours */}
      <div>
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button key={s}
              onClick={async () => { const u = await appApi.updateApplication(app.id, { status: s }); onUpdate(u); }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border ${
                app.status === s
                  ? STATUS_COLORS[s] + " border-current shadow-sm"
                  : "bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-700"
              }`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Quick fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1.5">Referral contact</label>
          <input value={referral} onChange={(e) => setReferral(e.target.value)} onBlur={() => void saveNotes()}
            className={INPUT} placeholder="Name or email" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1.5">Follow-up date</label>
          <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} onBlur={() => void saveNotes()}
            className={INPUT} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500 font-medium">Notes</label>
          {savingNotes && <span className="text-xs text-indigo-400">Saving…</span>}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void saveNotes()}
          rows={3} placeholder="Recruiter name, next steps, interview notes…"
          className={INPUT + " resize-none"} />
      </div>

      {/* JD — collapsible to save space */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500 font-medium">Job Description</label>
          <div className="flex items-center gap-3">
            {savingJd && <span className="text-xs text-indigo-400">Saving…</span>}
            {app.jd_url && (
              <a href={app.jd_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">View original ↗</a>
            )}
          </div>
        </div>
        <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} onBlur={() => void saveJd()}
          rows={5} placeholder="Paste the job description — used for ATS scoring and skill gap analysis"
          className={INPUT + " resize-y"} />
      </div>

      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
        <button onClick={() => { if (confirm("Remove this job from tracking?")) void onDelete(app.id); }}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          Remove from tracking
        </button>
        <p className="text-xs text-gray-300">Fields auto-save on blur</p>
      </div>
    </div>
  );
}

// ── Right panel (detail view) ──────────────────────────────────────────────────

function JobDetail({
  app,
  onUpdate,
  onDelete,
}: {
  app: Application;
  onUpdate: (a: Application) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("variants");
  const navigate = useNavigate();

  async function handleStatusChange(status: AppStatus) {
    const updated = await appApi.updateApplication(app.id, { status });
    onUpdate(updated);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Job header */}
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{app.company}</h2>
            <p className="text-gray-500 text-sm mt-0.5">{app.role_title}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <select
              value={app.status}
              onChange={(e) => void handleStatusChange(e.target.value as AppStatus)}
              className={`text-sm rounded-lg px-3 py-1.5 border-0 cursor-pointer focus:ring-2 focus:ring-accent ${STATUS_COLORS[app.status]}`}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              onClick={() => navigate(`/apply?job_id=${app.job_id}`)}
              className="text-sm bg-accent hover:bg-accent-hover text-white rounded-lg px-4 py-1.5 transition-colors"
            >
              Re-tailor
            </button>
          </div>
        </div>

        {/* ATS badge + variant count */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
          {app.ats_score !== null && (
            <span>ATS: <AtsScoreBadge score={app.ats_score} /></span>
          )}
          <span>{app.variant_count} variant{app.variant_count !== 1 ? "s" : ""}</span>
          {app.follow_up_date && new Date(app.follow_up_date) < new Date() && (
            <span className="text-red-600">⚠ Follow-up overdue</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 shrink-0 bg-gray-50">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-accent text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "variants" && <VariantsTab app={app} onAppUpdate={onUpdate} />}
        {tab === "cover" && <CoverLetterTab app={app} />}
        {tab === "gaps" && <SkillGapsTab app={app} />}
        {tab === "details" && <DetailsTab app={app} onUpdate={onUpdate} onDelete={onDelete} />}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default: hide closed statuses
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<AppStatus>>(
    new Set(["rejected", "withdrawn"])
  );
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    appApi.listApplications()
      .then((a) => {
        setApps(a);
        const visible = a.filter((x) => !hiddenStatuses.has(x.status));
        if (visible.length) setSelectedId(visible[0].id);
        else if (a.length) setSelectedId(a[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleStatus(status: AppStatus) {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filteredApps = apps.filter((a) => !hiddenStatuses.has(a.status));

  // Clear selection when selected job is no longer visible due to filter
  const effectiveSelectedId = filteredApps.find((a) => a.id === selectedId) ? selectedId : null;

  function handleUpdate(updated: Application) {
    setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function handleDelete(id: string) {
    try {
      await appApi.deleteApplication(id);
      setApps((prev) => {
        const remaining = prev.filter((a) => a.id !== id);
        setSelectedId(remaining.length ? remaining[0].id : null);
        return remaining;
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Failed to delete: ${e.message ?? "unknown error"}`);
    }
  }

  const selected = apps.find((a) => a.id === effectiveSelectedId) ?? null;

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-gray-200 space-y-px pt-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="mx-3 h-16 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: job list ── */}
      <div className="w-80 shrink-0 border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-200 shrink-0">
          {/* Row 1: title + apply */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-900 font-semibold text-sm">Applications</span>
            <Link
              to="/apply"
              className="text-xs bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-1.5 transition-colors"
            >
              + Apply
            </Link>
          </div>

          {/* Row 2: filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors w-full text-left ${
                hiddenStatuses.size > 0
                  ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                  : "border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {hiddenStatuses.size > 0
                ? `Showing ${STATUS_ORDER.length - hiddenStatuses.size} of ${STATUS_ORDER.length} statuses`
                : "Filter by status"}
              {filteredApps.length !== apps.length && (
                <span className="ml-1 text-gray-400">· {filteredApps.length}/{apps.length}</span>
              )}
            </button>

              {showFilter && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowFilter(false)}
                  />
                  {/* Popover */}
                  <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-48 py-2">
                    <div className="px-3 pb-1 flex items-center justify-between">
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Status</span>
                      <button
                        onClick={() => setHiddenStatuses(new Set(["rejected", "withdrawn"]))}
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                    {STATUS_ORDER.map((s) => {
                      const visible = !hiddenStatuses.has(s);
                      return (
                        <label
                          key={s}
                          className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggleStatus(s)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          <span className={`text-sm ${visible ? "text-gray-700" : "text-gray-400"}`}>
                            {STATUS_LABELS[s]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto">
          {apps.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-400 text-sm mb-3">No jobs yet</p>
              <Link to="/apply" className="text-accent text-sm hover:underline">
                Apply to your first job →
              </Link>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-400 text-sm mb-2">All jobs are filtered out</p>
              <button
                onClick={() => setHiddenStatuses(new Set())}
                className="text-accent text-xs hover:underline"
              >
                Show all
              </button>
            </div>
          ) : (
            filteredApps.map((app) => (
              <JobListItem
                key={app.id}
                app={app}
                selected={effectiveSelectedId === app.id}
                onClick={() => setSelectedId(app.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: job detail ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selected ? (
          <JobDetail
            key={selected.id}
            app={selected}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <p className="text-gray-400 text-sm">Select a job from the list</p>
            <Link to="/apply" className="text-accent text-sm hover:underline">
              Or apply to a new job →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
