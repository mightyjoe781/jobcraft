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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  return <span className={`text-xs font-semibold ${color}`}>{score}</span>;
}

function StatusPill({ status, onChange }: { status: AppStatus; onChange: (s: AppStatus) => void }) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as AppStatus)}
      onClick={(e) => e.stopPropagation()}
      className={`text-xs rounded-lg px-2 py-1 border-0 cursor-pointer focus:ring-1 focus:ring-accent ${STATUS_COLORS[status]}`}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

// ── Variants tab ───────────────────────────────────────────────────────────────

function VariantsTab({ app, onForkDone }: { app: Application; onForkDone: () => void }) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    resumeApi.listVariants(app.job_id).then(setVariants).finally(() => setVariantsLoading(false));
  }, [app.job_id]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this variant?")) return;
    setDeleting(id);
    try {
      await resumeApi.deleteVariant(id);
      setVariants((prev) => prev.filter((v) => v.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleFork(v: Variant) {
    const label = prompt("Label for new base resume:", `${v.company ?? app.company} fork`);
    if (!label) return;
    try {
      const diff = await resumeApi.getVariantDiff(v.id);
      await resumeApi.createBaseResume({ label, source_type: "forked_variant", source_variant_id: v.id, tex_source: diff.modified_tex });
      alert(`Forked as "${label}" — now in My Resumes`);
      onForkDone();
    } catch { alert("Fork failed"); }
  }

  async function handleSetActive(variantId: string) {
    await appApi.updateApplication(app.id, { resume_variant_id: variantId } as Parameters<typeof appApi.updateApplication>[1]);
  }

  if (variantsLoading) return <div className="p-4 text-gray-500 text-sm">Loading variants…</div>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-400 text-xs uppercase tracking-wide">
          {variants.length} variant{variants.length !== 1 ? "s" : ""} for this job
        </p>
        <button
          onClick={() => navigate(`/apply?job_id=${app.job_id}`)}
          className="text-xs bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          + Re-tailor
        </button>
      </div>

      {variants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm mb-3">No variants yet for this job</p>
          <button
            onClick={() => navigate(`/apply?job_id=${app.job_id}`)}
            className="text-accent text-sm hover:underline"
          >
            Tailor a resume for this job →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v.id} className={`flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2.5 ${app.variant_id === v.id ? "border border-accent/50" : ""}`}>
              {app.variant_id === v.id && (
                <span className="text-accent text-xs shrink-0">✓ Active</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">
                  {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                {v.ats_score !== null && <AtsScoreBadge score={v.ats_score} />}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setPreviewId(v.id)} className="text-xs text-accent hover:underline">Preview</button>
                <PdfDownloadLink apiPath={resumeApi.variantPdfUrl(v.id)} filename={`${app.company}-variant.pdf`} className="text-xs text-gray-400 hover:text-white">Download</PdfDownloadLink>
                {app.variant_id !== v.id && (
                  <button onClick={() => void handleSetActive(v.id)} className="text-xs text-gray-400 hover:text-white">Set active</button>
                )}
                <button onClick={() => void handleFork(v)} className="text-xs text-gray-400 hover:text-white">Fork</button>
                <button onClick={() => void handleDelete(v.id)} disabled={deleting === v.id} className="text-xs text-gray-600 hover:text-red-400">{deleting === v.id ? "…" : "Delete"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setPreviewId(null)}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
              <span className="text-white text-sm font-medium">Variant Preview</span>
              <div className="flex gap-3">
                <PdfDownloadLink apiPath={resumeApi.variantPdfUrl(previewId)} filename={`${app.company}-variant.pdf`} className="text-xs text-accent hover:underline">Download</PdfDownloadLink>
                <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-white text-xl">×</button>
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

function AtsTab({ app }: { app: Application }) {
  const [score, setScore] = useState<AtsScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleScore() {
    if (!app.variant_id) { alert("Set an active variant first"); return; }
    setScoring(true);
    try {
      const result = await atsApi.submitVariantScore(app.variant_id);
      if ("score_id" in result) {
        const pending: AtsScore = { id: result.score_id, status: "pending", overall_score: null, breakdown: null, missing_keywords: null, suggestions: null, error_message: null, created_at: new Date().toISOString() };
        setScore(pending);
        pollRef.current = setInterval(async () => {
          const s = await atsApi.getScore(result.score_id);
          if (s.status !== "pending") { setScore(s); if (pollRef.current) clearInterval(pollRef.current); }
        }, 2000);
      } else {
        setScore(result as AtsScore);
      }
    } finally {
      setScoring(false);
    }
  }

  const BREAKDOWN_LABELS: Record<string, string> = {
    keyword_match: "Keywords", semantic_relevance: "Relevance", formatting: "Formatting",
    action_verbs: "Action verbs", quantification: "Quantification", seniority_match: "Seniority",
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleScore()}
          disabled={scoring || !app.variant_id}
          className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors"
        >
          {scoring ? "Scoring…" : "Score active variant"}
        </button>
        {!app.variant_id && <p className="text-gray-500 text-xs">Set an active variant in the Variants tab first</p>}
      </div>

      {score?.status === "pending" && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Scoring your resume… (takes ~30s)
        </div>
      )}

      {score?.status === "complete" && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className={`text-4xl font-bold ${(score.overall_score ?? 0) >= 70 ? "text-green-400" : (score.overall_score ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {score.overall_score}
            </span>
            <div>
              <p className="text-white text-sm font-medium">ATS Score</p>
              <p className="text-gray-400 text-xs">
                {(score.overall_score ?? 0) >= 70 ? "Strong match" : (score.overall_score ?? 0) >= 50 ? "Moderate match" : "Needs improvement"}
              </p>
            </div>
          </div>
          {score.breakdown && (
            <div className="space-y-2">
              {Object.entries(score.breakdown).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs w-28 shrink-0">{BREAKDOWN_LABELS[k] ?? k}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${(v as number) >= 70 ? "bg-green-500" : (v as number) >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${v}%` }} />
                  </div>
                  <span className="text-white text-xs w-6">{v as number}</span>
                </div>
              ))}
            </div>
          )}
          {score.missing_keywords && score.missing_keywords.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Missing keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {score.missing_keywords.slice(0, 8).map((k, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded ${k.priority === "high" ? "bg-red-900/40 text-red-400" : "bg-gray-800 text-gray-400"}`}>{k.term}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {score?.status === "failed" && <p className="text-red-400 text-sm">{score.error_message}</p>}
    </div>
  );
}

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
    coverLetterApi.listCoverLetters()
      .then((all) => {
        const forJob = all.filter((cl) => cl.job_id === app.job_id);
        setLetters(forJob);
        if (forJob.length > 0) { setActiveText(forJob[0].body_text); setActiveLetterId(forJob[0].id); }
      });
  }, [app.job_id]);

  async function handleGenerate() {
    if (!app.variant_id && !app.job_id) return;
    setGenerating(true);
    setActiveText("");
    setActiveLetterId(null);
    try {
      let accumulated = "";
      for await (const event of coverLetterApi.streamGenerate({ job_id: app.job_id, resume_variant_id: app.variant_id ?? undefined, tone })) {
        if (event.type === "id") setActiveLetterId(event.data.cover_letter_id);
        else if (event.type === "chunk") { accumulated += event.data.text ?? ""; setActiveText(accumulated); }
        else if (event.type === "done") {
          const fresh = await coverLetterApi.listCoverLetters();
          setLetters(fresh.filter((cl) => cl.job_id === app.job_id));
        }
      }
    } finally { setGenerating(false); }
  }

  async function handleSave() {
    if (!activeLetterId) return;
    setSaving(true);
    try { await coverLetterApi.updateCoverLetter(activeLetterId, activeText); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-accent">
          <option value="formal">Formal</option>
          <option value="conversational">Conversational</option>
          <option value="enthusiastic">Enthusiastic</option>
        </select>
        <button onClick={() => void handleGenerate()} disabled={generating}
          className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors">
          {generating ? "Writing…" : letters.length > 0 ? "Regenerate" : "Generate"}
        </button>
        {activeLetterId && (
          <>
            <button onClick={() => void handleSave()} disabled={saving} className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={async () => { await navigator.clipboard.writeText(activeText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs text-gray-400 hover:text-white transition-colors">{copied ? "Copied!" : "Copy"}</button>
            <PdfDownloadLink apiPath={coverLetterApi.coverLetterPdfPath(activeLetterId)} filename={`cover-letter-${app.company}.pdf`}
              className="text-xs text-gray-400 hover:text-white transition-colors">Export PDF</PdfDownloadLink>
          </>
        )}
      </div>

      {(activeText || generating) && (
        <textarea value={activeText} onChange={(e) => setActiveText(e.target.value)} disabled={generating} rows={12}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm leading-7 resize-y focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-70 font-serif"
          style={{ fontFamily: "Georgia, serif" }} placeholder="Cover letter will appear here…" />
      )}

      {!activeText && !generating && letters.length === 0 && (
        <p className="text-gray-500 text-sm">No cover letter yet. Click Generate to create one.</p>
      )}

      {letters.length > 1 && (
        <div>
          <p className="text-gray-500 text-xs mb-2">Previous letters</p>
          <div className="space-y-1">
            {letters.slice(1).map((cl) => (
              <button key={cl.id} onClick={() => { setActiveText(cl.body_text); setActiveLetterId(cl.id); }}
                className="w-full text-left text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded hover:bg-gray-800 transition-colors">
                {cl.tone} · {new Date(cl.created_at).toLocaleDateString()}
              </button>
            ))}
          </div>
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

  async function handleAnalyze() {
    if (!baseId) return;
    setAnalyzing(true);
    try { const result = await skillGapApi.analyzeGaps(app.job_id, baseId); setGaps(result); }
    finally { setAnalyzing(false); }
  }

  const CATEGORY_LABELS: Record<string, string> = {
    hard_skill: "Hard Skills", tool: "Tools", domain: "Domain", seniority: "Seniority"
  };

  const STATUS_COLORS_GAP: Record<GapStatus, string> = {
    identified: "text-gray-400 bg-gray-800",
    learning: "text-blue-400 bg-blue-900/30",
    acquired: "text-green-400 bg-green-900/30",
    not_pursuing: "text-gray-600 bg-gray-900",
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <select value={baseId} onChange={(e) => setBaseId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-accent">
          {bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <button onClick={() => void handleAnalyze()} disabled={analyzing || !baseId || !app.jd_text}
          className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors">
          {analyzing ? "Analyzing…" : gaps.length > 0 ? "Re-analyze" : "Analyze gaps"}
        </button>
        {!app.jd_text && <p className="text-gray-500 text-xs">Add a JD in the Details tab first</p>}
      </div>

      {gaps.length > 0 && (
        <div className="space-y-4">
          {["hard_skill", "tool", "domain", "seniority"].map((cat) => {
            const catGaps = gaps.filter((g) => g.category === cat);
            if (!catGaps.length) return null;
            return (
              <div key={cat}>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
                <div className="space-y-2">
                  {catGaps.sort((a, b) => b.priority - a.priority).map((g) => (
                    <div key={g.id} className={`flex items-start gap-3 bg-gray-800 rounded-lg px-3 py-2 ${g.status === "acquired" || g.status === "not_pursuing" ? "opacity-50" : ""}`}>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${g.priority >= 8 ? "bg-red-900/40 text-red-400" : g.priority >= 5 ? "bg-yellow-900/40 text-yellow-400" : "bg-gray-700 text-gray-400"}`}>P{g.priority}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium">{g.skill_name}</p>
                        <p className="text-gray-400 text-xs">{g.suggested_resource}</p>
                      </div>
                      <select value={g.status} onChange={async (e) => {
                        const updated = await skillGapApi.updateGapStatus(g.id, e.target.value as GapStatus);
                        setGaps((prev) => prev.map((x) => x.id === g.id ? updated : x));
                      }} className={`text-xs rounded px-1.5 py-0.5 border-0 cursor-pointer shrink-0 ${STATUS_COLORS_GAP[g.status]}`}>
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
      )}

      {gaps.length === 0 && !analyzing && (
        <p className="text-gray-500 text-sm">No gap analysis yet. Select a base resume and click Analyze.</p>
      )}
    </div>
  );
}

// ── Details tab ────────────────────────────────────────────────────────────────

function DetailsTab({ app, onUpdate, onDelete }: {
  app: Application;
  onUpdate: (updated: Application) => void;
  onDelete: (id: string) => void;
}) {
  const [jdText, setJdText] = useState(app.jd_text ?? "");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [referral, setReferral] = useState(app.referral_contact ?? "");
  const [followUp, setFollowUp] = useState(app.follow_up_date ?? "");
  const [savingJd, setSavingJd] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  async function handleSaveJd() {
    setSavingJd(true);
    try { await updateJob(app.job_id, { jd_text: jdText }); }
    finally { setSavingJd(false); }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const updated = await appApi.updateApplication(app.id, { notes, referral_contact: referral, follow_up_date: followUp || undefined });
      onUpdate(updated);
    } finally { setSavingNotes(false); }
  }

  return (
    <div className="p-4 space-y-5">
      {/* Status quick-set */}
      <div>
        <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={async () => {
              const updated = await appApi.updateApplication(app.id, { status: s });
              onUpdate(updated);
            }} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${app.status === s ? STATUS_COLORS[s] + " ring-1 ring-current" : "bg-gray-800 text-gray-500 hover:text-white"}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* JD */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Job Description</label>
          {app.jd_url && <a href={app.jd_url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">View original ↗</a>}
        </div>
        <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} rows={5}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-y focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Paste job description — used for ATS scoring and skill gap analysis" />
        <div className="flex justify-end mt-1.5">
          <button onClick={() => void handleSaveJd()} disabled={savingJd}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-3 py-1 transition-colors">
            {savingJd ? "Saving…" : "Save JD"}
          </button>
        </div>
      </div>

      {/* Notes + referral + follow-up */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Recruiter name, next steps, interview notes…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Referral contact</label>
            <input value={referral} onChange={(e) => setReferral(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Name or email" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Follow-up date</label>
            <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => { if (confirm("Remove this job from tracking?")) void onDelete(app.id); }}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors">Remove from tracking</button>
          <button onClick={() => void handleSaveNotes()} disabled={savingNotes}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-3 py-1 transition-colors">
            {savingNotes ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Card ───────────────────────────────────────────────────────────────────

type TabId = "variants" | "ats" | "cover" | "gaps" | "details";

const TABS: { id: TabId; label: string }[] = [
  { id: "variants", label: "Variants" },
  { id: "ats", label: "ATS Score" },
  { id: "cover", label: "Cover Letter" },
  { id: "gaps", label: "Skill Gaps" },
  { id: "details", label: "Details" },
];

function JobCard({ app, isExpanded, onToggle, onUpdate, onDelete }: {
  app: Application;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (a: Application) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("variants");
  const daysOpen = Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86_400_000);
  const isOverdue = app.follow_up_date && new Date(app.follow_up_date) < new Date();

  async function handleStatusChange(status: AppStatus) {
    const updated = await appApi.updateApplication(app.id, { status });
    onUpdate(updated);
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Collapsed header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-white font-semibold truncate">{app.company}</p>
            {isOverdue && <span className="text-red-400 text-xs shrink-0">⚠ follow-up</span>}
          </div>
          <p className="text-gray-400 text-xs truncate">{app.role_title}</p>
        </div>

        <StatusPill status={app.status} onChange={(s) => void handleStatusChange(s)} />

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <p className="text-gray-600 text-xs">ATS</p>
            <AtsScoreBadge score={app.ats_score} />
          </div>
          <div className="text-center hidden sm:block">
            <p className="text-gray-600 text-xs">Variants</p>
            <p className="text-gray-300 text-xs">{app.variant_count}</p>
          </div>
          <p className="text-gray-600 text-xs hidden md:block">{daysOpen}d</p>
          <span className="text-gray-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 bg-gray-900/60">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.id ? "border-accent text-white" : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content — lazy loaded */}
          <div className="max-h-[480px] overflow-y-auto">
            {tab === "variants" && <VariantsTab app={app} onForkDone={() => {}} />}
            {tab === "ats" && <AtsTab app={app} />}
            {tab === "cover" && <CoverLetterTab app={app} />}
            {tab === "gaps" && <SkillGapsTab app={app} />}
            {tab === "details" && <DetailsTab app={app} onUpdate={onUpdate} onDelete={onDelete} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    const a = await appApi.listApplications();
    setApps(a);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function handleUpdate(updated: Application) {
    setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function handleDelete(id: string) {
    try {
      await appApi.deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
      setExpandedId(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Failed to delete: ${e.message ?? "unknown error"}`);
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Applications</h1>
          <p className="text-gray-400 text-sm">Every job you've worked on — variants, scores, and tracking in one place.</p>
        </div>
        <Link to="/apply" className="bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors">
          + Apply to Job
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-gray-500 mb-2">No jobs tracked yet.</p>
          <p className="text-gray-600 text-sm mb-6">Tailor a resume for a job — it appears here automatically.</p>
          <Link to="/apply" className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-5 py-2.5 transition-colors">
            Apply to your first job →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <JobCard
              key={app.id}
              app={app}
              isExpanded={expandedId === app.id}
              onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
              onUpdate={handleUpdate}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
