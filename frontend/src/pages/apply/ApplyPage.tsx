import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { createJob, fetchJd, startTailoring } from "../../api/tailor";
import { createApplication } from "../../api/applications";
import type { Job } from "../../api/tailor";
import { listBaseResumes, variantPdfUrl } from "../../api/resumes";
import type { BaseResume } from "../../api/resumes";
import { PdfViewer, PdfDownloadLink } from "../../components/PdfViewer";
import { submitVariantScore, getScore } from "../../api/ats";
import type { AtsScore } from "../../api/ats";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGRESSIVENESS = [
  { value: "conservative", label: "Conservative", desc: "Reorder bullets, swap synonyms only" },
  { value: "balanced", label: "Balanced", desc: "Rewrite up to 30% of bullets" },
  { value: "aggressive", label: "Aggressive", desc: "Rewrite bullets, strengthen verbs" },
] as const;

type AggressivenessValue = "conservative" | "balanced" | "aggressive";

type Step = 1 | 2 | 3 | "result";

type ProgressStep = { message: string; done: boolean };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "template") return "From template";
  if (sourceType === "upload") return "Uploaded";
  if (sourceType === "fork") return "Forked";
  return sourceType;
}

// ---------------------------------------------------------------------------
// Step progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: Step }) {
  const numericStep = step === "result" ? 3 : step;

  const circles = [1, 2, 3] as const;
  return (
    <div className="flex items-center justify-center mb-10 gap-0">
      {circles.map((n, idx) => {
        const done = numericStep > n;
        const active = numericStep === n;
        return (
          <div key={n} className="flex items-center">
            {idx > 0 && (
              <div
                className={`h-0.5 w-16 ${
                  numericStep > n ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-gray-400 border border-gray-200"
              }`}
            >
              {done ? "✓" : n}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ApplyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobIdParam = searchParams.get("job_id");

  // Step state
  const [step, setStep] = useState<Step>(1);
  const [step1Collapsed, setStep1Collapsed] = useState(false);

  // Step 1 state
  const [jdUrl, setJdUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [fetchingJd, setFetchingJd] = useState(false);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Job result from step 1
  const [job, setJob] = useState<Job | null>(null);

  // Step 2 state
  const [bases, setBases] = useState<BaseResume[]>([]);
  const [selectedBase, setSelectedBase] = useState<BaseResume | null>(null);

  // Step 3 state
  const [aggressiveness, setAggressiveness] = useState<AggressivenessValue>("balanced");
  const [customInstruction, setCustomInstruction] = useState("");
  const [tailoring, setTailoring] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [atsScore, setAtsScore] = useState<AtsScore | null>(null);
  const [scoringAts, setScoringAts] = useState(false);
  const atsPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Fetch base resumes once on mount
  useEffect(() => {
    listBaseResumes().then((r) => {
      setBases(r);
    });
  }, []);

  // If job_id query param present, fetch the job and skip to step 2
  useEffect(() => {
    if (!jobIdParam) return;

    apiFetch<Job>(`/jobs/${jobIdParam}`)
      .then((j) => {
        setJob(j);
        setCompany(j.company);
        setRoleTitle(j.role_title);
        setJdText(j.jd_text ?? "");
        setJdUrl(j.jd_url ?? "");
        setStep1Collapsed(true);
        setStep(2);
      })
      .catch(() => {
        // If fetch fails, just stay on step 1
      });
  }, [jobIdParam]);

  // Auto-select if only one resume
  useEffect(() => {
    if (!job || bases.length === 0) return;
    if (bases.length === 1) {
      setSelectedBase(bases[0]);
      setStep(3);
    }
  }, [job, bases]);

  // ---------------------------------------------------------------------------
  // Step 1 handlers
  // ---------------------------------------------------------------------------

  async function handleFetchJd() {
    if (!jdUrl.trim()) return;
    setFetchingJd(true);
    setStep1Error(null);
    try {
      const result = await fetchJd(jdUrl);
      setJdText(result.jd_text);
      if (result.company) setCompany(result.company);
      if (result.role_title) setRoleTitle(result.role_title);
    } catch {
      setStep1Error("Could not fetch the job description from that URL.");
    } finally {
      setFetchingJd(false);
    }
  }

  async function handleStep1Continue() {
    if (!jdText.trim() || !roleTitle.trim()) return;
    setStep1Loading(true);
    setStep1Error(null);
    try {
      const created = await createJob({
        company,
        role_title: roleTitle,
        jd_text: jdText,
        jd_url: jdUrl || undefined,
      });
      setJob(created);
      setStep1Collapsed(true);
      setStep(2);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setStep1Error(e.message ?? "Failed to save job.");
    } finally {
      setStep1Loading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3 handlers
  // ---------------------------------------------------------------------------

  function addProgressStep(message: string) {
    setSteps((prev) => [
      ...prev.map((s) => ({ ...s, done: true })),
      { message, done: false },
    ]);
  }

  async function handleTailor() {
    if (!selectedBase || !job) return;
    setTailoring(true);
    setTailorError(null);
    setSteps([]);

    try {
      const res = await startTailoring({
        base_resume_id: selectedBase.id,
        job_id: job.id,
        aggressiveness,
        custom_instruction: customInstruction || undefined,
      });

      setVariantId(res.variant_id);

      const token = localStorage.getItem("access_token") ?? "";
      const es = new EventSource(
        `${res.stream_url}?token=${encodeURIComponent(token)}`
      );
      eventSourceRef.current = es;

      es.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        addProgressStep(data.message);
      });

      es.addEventListener("diff_ready", () => {
        addProgressStep("Compiling PDF…");
      });

      es.addEventListener("pdf_ready", () => {
        setTailoring(false);
        setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
        es.close();
        setStep("result");
      });

      es.addEventListener("error", (e) => {
        let message = "Tailoring failed";
        try {
          const data = JSON.parse((e as MessageEvent).data ?? "{}");
          message = data.message ?? message;
        } catch {
          // ignore parse error
        }
        setTailorError(message);
        setTailoring(false);
        es.close();
      });

      es.onerror = async () => {
        es.close();
        setTailoring(false);

        // nginx timed out but worker likely still running — poll variant
        const id = res.variant_id;
        let attempts = 0;
        const check = setInterval(async () => {
          attempts++;
          try {
            const { getAccessToken } = await import("../../api/client");
            const t = getAccessToken();
            const r = await fetch(`/api/resumes/variants/${id}`, {
              headers: t ? { Authorization: `Bearer ${t}` } : {},
            });
            if (r.ok) {
              const variant = await r.json();
              if (variant.pdf_path) {
                clearInterval(check);
                setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
                setStep("result");
                return;
              }
            }
          } catch { /* ignore */ }
          if (attempts >= 24) { // 2 min total
            clearInterval(check);
            setTailorError("Connection timed out — tailoring may still be running. Check Applications in a moment.");
          }
        }, 5000);
      };
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTailorError(e.message ?? "Failed to start tailoring.");
      setTailoring(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers (defined as variables, not nested components, to avoid
  // React Rules of Hooks violations)
  // ---------------------------------------------------------------------------

  const step1CanContinue =
    jdText.trim().length > 50 && roleTitle.trim().length > 0;

  // ---------------------------------------------------------------------------
  // Result view
  // ---------------------------------------------------------------------------

  if (step === "result" && variantId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden -m-8">
          {/* Left action panel */}
          <div className="w-96 shrink-0 p-6 bg-white border-r border-gray-200 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <h2 className="text-gray-900 font-semibold">Resume tailored</h2>
            </div>

            {/* Download + secondary actions */}
            <div className="space-y-2">
              <PdfDownloadLink
                apiPath={variantPdfUrl(variantId)}
                filename={`${company ? company.toLowerCase().replace(/\s+/g, "-") : "tailored"}-resume.pdf`}
                className="block w-full bg-accent hover:bg-accent-hover text-white text-sm rounded-lg py-2.5 text-center transition-colors"
              >
                Download PDF
              </PdfDownloadLink>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate("/applications")}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg py-2 transition-colors"
                >
                  View in Applications
                </button>
                <button
                  onClick={() => { setStep(3); setSteps([]); setVariantId(null); setAtsScore(null); setTailoring(false); setTailorError(null); if (atsPollerRef.current) clearInterval(atsPollerRef.current); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg py-2 transition-colors"
                >
                  Tailor again
                </button>
              </div>
            </div>

            {/* ATS Scoring section */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-700 text-sm font-medium">ATS Score</p>
                {!atsScore && (
                  <button
                    onClick={async () => {
                      if (!variantId || scoringAts) return;
                      setScoringAts(true);
                      setAtsScore(null);
                      try {
                        const result = await submitVariantScore(variantId);
                        if ("score_id" in result) {
                          const pending: AtsScore = { id: result.score_id, status: "pending", overall_score: null, breakdown: null, missing_keywords: null, suggestions: null, error_message: null, created_at: new Date().toISOString() };
                          setAtsScore(pending);
                          atsPollerRef.current = setInterval(async () => {
                            const s = await getScore(result.score_id);
                            if (s.status !== "pending") { setAtsScore(s); clearInterval(atsPollerRef.current!); setScoringAts(false); }
                          }, 2000);
                        } else {
                          setAtsScore(result as AtsScore);
                          setScoringAts(false);
                        }
                      } catch { setScoringAts(false); }
                    }}
                    disabled={scoringAts}
                    className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                  >
                    {scoringAts ? "Scoring…" : "Score now"}
                  </button>
                )}
                {atsScore?.status === "complete" && (
                  <button onClick={() => { setAtsScore(null); setScoringAts(false); if (atsPollerRef.current) clearInterval(atsPollerRef.current); }}
                    className="text-xs text-gray-400 hover:text-gray-700">Re-score</button>
                )}
              </div>

              {!atsScore && !scoringAts && (
                <p className="text-gray-400 text-xs">Click "Score now" to check how this resume performs against the job description.</p>
              )}

              {atsScore?.status === "pending" && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Analysing… (~30s)
                </div>
              )}

              {atsScore?.status === "failed" && (
                <p className="text-red-500 text-xs">{atsScore.error_message ?? "Scoring failed"}</p>
              )}

              {atsScore?.status === "complete" && (() => {
                const s = atsScore.overall_score ?? 0;
                const color = s >= 70 ? "text-green-600" : s >= 50 ? "text-yellow-600" : "text-red-600";
                const LABELS: Record<string, string> = { keyword_match: "Keywords", semantic_relevance: "Relevance", formatting: "Formatting", action_verbs: "Action Verbs", quantification: "Quantification", seniority_match: "Seniority" };
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-4xl font-bold ${color}`}>{s}</span>
                      <div>
                        <p className="text-gray-700 text-sm font-medium">ATS Score</p>
                        <p className="text-gray-400 text-xs">{s >= 70 ? "Strong match" : s >= 50 ? "Moderate match" : "Needs improvement"}</p>
                      </div>
                    </div>
                    {atsScore.breakdown && (
                      <div className="space-y-1.5">
                        {Object.entries(atsScore.breakdown).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-20 shrink-0">{LABELS[k] ?? k}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${(v as number) >= 70 ? "bg-green-500" : (v as number) >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${v}%` }} />
                            </div>
                            <span className="text-xs text-gray-600 w-6 text-right">{v as number}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {atsScore.missing_keywords && atsScore.missing_keywords.length > 0 && (
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Missing keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {atsScore.missing_keywords.slice(0, 5).map((k, i) => (
                            <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${k.priority === "high" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>{k.term}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right PDF preview */}
          <PdfViewer
            apiPath={variantPdfUrl(variantId)}
            className="flex-1"
            title="Tailored resume"
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Wizard steps
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Step progress indicator */}
      <StepIndicator step={step} />

      {/* Step 1 collapsed summary (shown when on step 2 or 3) */}
      {step1Collapsed && step !== 1 && (
        <div className="max-w-3xl mx-auto mb-6">
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm">
            <span className="text-gray-700 text-sm">
              <span className="mr-2">&#128203;</span>
              <span className="font-medium text-gray-900">{company || "—"}</span>
              {roleTitle && (
                <span className="text-gray-500"> — {roleTitle}</span>
              )}
            </span>
            <button
              onClick={() => {
                setStep1Collapsed(false);
                setStep(1);
              }}
              className="text-accent text-sm hover:underline"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {/* Step 1 — full form */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Job details</h2>

          {step1Error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {step1Error}
            </div>
          )}

          {/* URL fetch row */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Job posting URL <span className="text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleFetchJd();
                  }
                }}
                placeholder="https://jobs.lever.co/..."
                className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => void handleFetchJd()}
                disabled={fetchingJd || !jdUrl.trim()}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm rounded-lg px-4 py-2.5 transition-colors shrink-0 flex items-center gap-2"
              >
                {fetchingJd ? (
                  <>
                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Fetching…
                  </>
                ) : (
                  "Fetch"
                )}
              </button>
            </div>
          </div>

          {/* JD textarea */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Job description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={10}
              placeholder="Paste the full job description here…"
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Company + Role */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Stripe"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Role title <span className="text-red-500">*</span>
              </label>
              <input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Senior Data Engineer"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <button
            onClick={() => void handleStep1Continue()}
            disabled={!step1CanContinue || step1Loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors flex items-center justify-center gap-2"
          >
            {step1Loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      )}

      {/* Step 2 — Base resume selection */}
      {step === 2 && (
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
            Choose a base resume
          </h2>

          {bases.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
              <p className="text-gray-500 mb-4">You have no base resumes yet.</p>
              <a href="/resumes" className="text-accent hover:underline text-sm">
                Create one first →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bases.map((b) => {
                const isSelected = selectedBase?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBase(b)}
                    className={`text-left p-5 rounded-xl border transition-colors ${
                      isSelected
                        ? "border-accent bg-indigo-50"
                        : "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-gray-900 font-medium text-sm leading-snug">
                        {b.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                        {sourceTypeLabel(b.source_type)}
                      </span>
                      <span>
                        {b.variant_count} variant{b.variant_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(3)}
              disabled={!selectedBase}
              className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg px-8 py-3 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Tailor &amp; Track + streaming progress */}
      {step === 3 && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
            Tailor &amp; Track
          </h2>

          {tailorError && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {tailorError}
            </div>
          )}

          {tailoring ? (
            /* Streaming progress */
            <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-4 shadow-sm">
              <h3 className="text-gray-900 font-medium">Tailoring in progress…</h3>
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {s.done ? (
                      <span className="text-green-600 shrink-0">&#10003;</span>
                    ) : (
                      <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    <span className={s.done ? "text-gray-500" : "text-gray-900"}>
                      {s.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6 shadow-sm">
              {/* Aggressiveness */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Aggressiveness
                </label>
                <div className="space-y-2">
                  {AGGRESSIVENESS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        aggressiveness === opt.value
                          ? "border-accent bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="aggressiveness"
                        value={opt.value}
                        checked={aggressiveness === opt.value}
                        onChange={() => setAggressiveness(opt.value)}
                        className="mt-0.5 accent-[#4f46e5]"
                      />
                      <div>
                        <p className="text-gray-900 text-sm font-medium">{opt.label}</p>
                        <p className="text-gray-500 text-xs">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom instruction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Custom instruction{" "}
                  <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. emphasise distributed systems experience"
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {customInstruction.length}/500
                </p>
              </div>

              <button
                onClick={() => void handleTailor()}
                disabled={!selectedBase || !job}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
              >
                Tailor Resume
              </button>

              <div className="text-center pt-2">
                <button
                  onClick={async () => {
                    if (job) await createApplication(job.id).catch(() => {});
                    navigate("/applications");
                  }}
                  className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Skip tailoring — track this job without a variant
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  You can tailor from the Applications panel later
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
