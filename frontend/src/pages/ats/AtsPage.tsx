import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as atsApi from "../../api/ats";
import * as resumeApi from "../../api/resumes";
import type { AtsScore, AtsBreakdown } from "../../api/ats";
import type { Variant } from "../../api/resumes";

type Tab = "variant" | "upload";

function ScoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function RadarBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 text-xs w-40 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-white text-xs w-8 text-right">{value}</span>
    </div>
  );
}

function ScoreResult({ score }: { score: AtsScore }) {
  if (score.status === "pending") {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Scoring your resume…</p>
      </div>
    );
  }

  if (score.status === "failed") {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Scoring failed: {score.error_message}
      </div>
    );
  }

  const b = score.breakdown as AtsBreakdown;
  const overall = score.overall_score ?? 0;

  const BREAKDOWN_LABELS: Record<keyof AtsBreakdown, string> = {
    keyword_match: "Keyword match",
    semantic_relevance: "Semantic relevance",
    formatting: "Formatting",
    action_verbs: "Action verbs",
    quantification: "Quantification",
    seniority_match: "Seniority match",
  };

  return (
    <div className="space-y-6">
      {/* Overall score */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center gap-6">
        <div className={`text-6xl font-bold ${ScoreColor(overall)}`}>{overall}</div>
        <div>
          <p className="text-white font-medium text-lg">ATS Score</p>
          <p className="text-gray-400 text-sm">
            {overall >= 70 ? "Strong match — good chance of passing ATS filters" :
             overall >= 50 ? "Moderate match — consider the improvements below" :
             "Weak match — significant changes recommended"}
          </p>
        </div>
      </div>

      {/* Breakdown bars */}
      {b && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <h3 className="text-white font-medium mb-4">Score breakdown</h3>
          {(Object.keys(BREAKDOWN_LABELS) as (keyof AtsBreakdown)[]).map((k) => (
            <RadarBar key={k} label={BREAKDOWN_LABELS[k]} value={b[k]} />
          ))}
        </div>
      )}

      {/* Missing keywords */}
      {score.missing_keywords && score.missing_keywords.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-medium mb-4">Missing keywords</h3>
          <div className="space-y-2">
            {score.missing_keywords.map((k, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                  k.priority === "high" ? "bg-red-900/40 text-red-400" :
                  k.priority === "medium" ? "bg-yellow-900/40 text-yellow-400" :
                  "bg-gray-800 text-gray-400"
                }`}>{k.priority}</span>
                <div>
                  <span className="text-white font-mono">{k.term}</span>
                  <span className="text-gray-500 ml-2">→ {k.suggested_location}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvement suggestions */}
      {score.suggestions && score.suggestions.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-medium mb-4">Improvements</h3>
          <div className="space-y-3">
            {score.suggestions.sort((a, b) => a.priority - b.priority).map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm border-b border-gray-800 pb-3 last:border-0 last:pb-0">
                <span className="text-gray-600 shrink-0 w-5">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-white">{s.suggestion}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.category} · {s.estimated_impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill gap entry point */}
      {score.status === "complete" && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 border-dashed p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-medium">Want to close these gaps?</p>
            <p className="text-gray-400 text-xs mt-0.5">
              Run a skill gap analysis to get a prioritised learning plan for this role.
            </p>
          </div>
          <Link
            to="/analyze?tab=skill-gaps"
            className="shrink-0 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-4 py-2 transition-colors"
          >
            Analyze skill gaps →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function AtsPage() {
  const [searchParams] = useSearchParams();
  const preselectedVariant = searchParams.get("variant");

  const [tab, setTab] = useState<Tab>("variant");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState(preselectedVariant ?? "");
  const [jdText, setJdText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState<AtsScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    resumeApi.listVariants().then(setVariants);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (preselectedVariant) setVariantId(preselectedVariant);
  }, [preselectedVariant]);

  function startPolling(scoreId: string) {
    pollRef.current = setInterval(async () => {
      const s = await atsApi.getScore(scoreId);
      if (s.status !== "pending") {
        setScore(s);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setScore(null);
    setSubmitting(true);

    try {
      let result: atsApi.AtsScore | atsApi.AsyncScoreResponse;

      if (tab === "variant") {
        result = await atsApi.submitScore({ resume_variant_id: variantId, jd_text: jdText || undefined });
      } else {
        if (!pdfFile) { setError("Upload a PDF"); setSubmitting(false); return; }
        if (!jdText.trim()) { setError("Add a job description"); setSubmitting(false); return; }
        // multipart form for PDF upload
        const form = new FormData();
        form.append("uploaded_pdf", pdfFile);
        form.append("jd_text", jdText);
        const token = localStorage.getItem("access_token");
        const res = await fetch("/api/ats/score", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        result = await res.json();
      }

      if ("score_id" in result) {
        // 202 async fallback
        const pending: AtsScore = {
          id: result.score_id,
          status: "pending",
          overall_score: null,
          breakdown: null,
          missing_keywords: null,
          suggestions: null,
          error_message: null,
          created_at: new Date().toISOString(),
        };
        setScore(pending);
        startPolling(result.score_id);
      } else {
        setScore(result as AtsScore);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Scoring failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">ATS Score</h1>
      <p className="text-gray-400 text-sm mb-8">
        See how your resume performs against ATS filters and get specific improvement suggestions.
      </p>

      {!score && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Tab selector */}
          <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit border border-gray-800">
            <button
              type="button"
              onClick={() => setTab("variant")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                tab === "variant" ? "bg-accent text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Score my variant
            </button>
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                tab === "upload" ? "bg-accent text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Score uploaded PDF
            </button>
          </div>

          {tab === "variant" ? (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Select variant</label>
              {variants.length === 0 ? (
                <p className="text-sm text-gray-500">No variants yet. Tailor a resume first.</p>
              ) : (
                <select
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Select a variant…</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label ?? `${v.company ?? "?"} — ${v.role_title ?? "?"}`}
                      {v.ats_score !== null ? ` (ATS: ${v.ats_score})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Upload PDF resume</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent file:text-white hover:file:bg-accent-hover"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Job description{" "}
              {tab === "variant" && <span className="text-gray-500">(optional if variant is linked to a job)</span>}
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={8}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Paste the job description…"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scoring…
              </span>
            ) : "Score resume"}
          </button>
        </form>
      )}

      {score && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Results</h2>
            <button
              onClick={() => { setScore(null); setError(null); }}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Score again
            </button>
          </div>
          <ScoreResult score={score} />
        </div>
      )}
    </div>
  );
}
