import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { createJob, fetchJd, startTailoring } from "../../api/tailor";
import type { Job } from "../../api/tailor";
import { listBaseResumes, variantPdfUrl } from "../../api/resumes";
import type { BaseResume } from "../../api/resumes";
import { PdfViewer, PdfDownloadLink } from "../../components/PdfViewer";

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

function scoreMatch(resume: BaseResume, jdText: string): number {
  const jdWords = new Set(
    jdText
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const resumeWords = (resume.label + " " + resume.source_type)
    .toLowerCase()
    .split(/\W+/);
  return resumeWords.filter((w) => jdWords.has(w)).length;
}

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
                  numericStep > n ? "bg-green-500" : "bg-gray-700"
                }`}
              />
            )}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-accent text-white"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
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
  const [suggestedId, setSuggestedId] = useState<string | null>(null);

  // Step 3 state
  const [aggressiveness, setAggressiveness] = useState<AggressivenessValue>("balanced");
  const [customInstruction, setCustomInstruction] = useState("");
  const [tailoring, setTailoring] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
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

  // Compute keyword suggestion whenever job changes and bases are loaded
  useEffect(() => {
    if (!job || bases.length === 0) return;

    const jd = job.jd_text ?? "";
    let bestId: string | null = null;
    let bestScore = -1;
    for (const b of bases) {
      const s = scoreMatch(b, jd);
      if (s > bestScore) {
        bestScore = s;
        bestId = b.id;
      }
    }
    setSuggestedId(bestId);

    // Auto-select if only one resume
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

      es.onerror = () => {
        setTailorError("Lost connection to server");
        setTailoring(false);
        es.close();
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
      <div className="min-h-screen bg-gray-950 p-8">
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden -m-8">
          {/* Left action panel */}
          <div className="w-80 shrink-0 p-6 bg-gray-900 border-r border-gray-800 flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-white font-semibold">&#10003; Tailoring complete</h2>

            {/* Completed steps list */}
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-green-400 shrink-0">&#10003;</span>
                  <span className="text-gray-300">{s.message}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="mt-auto space-y-2">
              <PdfDownloadLink
                apiPath={variantPdfUrl(variantId)}
                filename="tailored-resume.pdf"
                className="block w-full bg-accent hover:bg-accent-hover text-white text-sm rounded-lg py-2.5 text-center transition-colors"
              >
                Download PDF
              </PdfDownloadLink>
              <button
                onClick={() => navigate("/applications")}
                className="block w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2.5 text-center transition-colors"
              >
                Score ATS
              </button>
              <button
                onClick={() => navigate("/applications")}
                className="block w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2.5 text-center transition-colors"
              >
                View in Applications
              </button>
              <button
                onClick={() => {
                  setStep(3);
                  setSteps([]);
                  setVariantId(null);
                  setTailoring(false);
                  setTailorError(null);
                }}
                className="block w-full text-gray-500 hover:text-white text-sm py-2 transition-colors"
              >
                Tailor again
              </button>
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
    <div className="min-h-screen bg-gray-950 p-8">
      {/* Step progress indicator */}
      <StepIndicator step={step} />

      {/* Step 1 collapsed summary (shown when on step 2 or 3) */}
      {step1Collapsed && step !== 1 && (
        <div className="max-w-3xl mx-auto mb-6">
          <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-6 py-4">
            <span className="text-gray-300 text-sm">
              <span className="mr-2">&#128203;</span>
              <span className="font-medium text-white">{company || "—"}</span>
              {roleTitle && (
                <span className="text-gray-400"> — {roleTitle}</span>
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
        <div className="max-w-2xl mx-auto bg-gray-900 rounded-xl border border-gray-800 p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Job details</h2>

          {step1Error && (
            <div className="mb-5 bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {step1Error}
            </div>
          )}

          {/* URL fetch row */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Job posting URL <span className="text-gray-500">(optional)</span>
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
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => void handleFetchJd()}
                disabled={fetchingJd || !jdUrl.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm rounded-lg px-4 py-2.5 transition-colors shrink-0 flex items-center gap-2"
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
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Job description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={10}
              placeholder="Paste the full job description here…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Company + Role */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Stripe"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Role title <span className="text-red-400">*</span>
              </label>
              <input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Senior Data Engineer"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Choose a base resume
          </h2>

          {bases.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center">
              <p className="text-gray-400 mb-4">You have no base resumes yet.</p>
              <a href="/resumes" className="text-accent hover:underline text-sm">
                Create one first →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bases.map((b) => {
                const isSelected = selectedBase?.id === b.id;
                const isSuggested = b.id === suggestedId;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBase(b)}
                    className={`text-left p-5 rounded-xl border transition-colors ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-gray-800 bg-gray-900 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-white font-medium text-sm leading-snug">
                        {b.label}
                      </span>
                      {isSuggested && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-medium shrink-0">
                          Suggested
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400">
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

      {/* Step 3 — Tailor settings + streaming progress */}
      {step === 3 && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Tailor settings
          </h2>

          {tailorError && (
            <div className="mb-5 bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {tailorError}
            </div>
          )}

          {tailoring ? (
            /* Streaming progress */
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 space-y-4">
              <h3 className="text-white font-medium">Tailoring in progress…</h3>
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {s.done ? (
                      <span className="text-green-400 shrink-0">&#10003;</span>
                    ) : (
                      <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    <span className={s.done ? "text-gray-400" : "text-white"}>
                      {s.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 space-y-6">
              {/* Aggressiveness */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Aggressiveness
                </label>
                <div className="space-y-2">
                  {AGGRESSIVENESS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        aggressiveness === opt.value
                          ? "border-accent bg-accent/10"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="aggressiveness"
                        value={opt.value}
                        checked={aggressiveness === opt.value}
                        onChange={() => setAggressiveness(opt.value)}
                        className="mt-0.5 accent-[#6366f1]"
                      />
                      <div>
                        <p className="text-white text-sm font-medium">{opt.label}</p>
                        <p className="text-gray-400 text-xs">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom instruction */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Custom instruction{" "}
                  <span className="text-gray-500">(optional)</span>
                </label>
                <textarea
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. emphasise distributed systems experience"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p className="text-xs text-gray-600 mt-1 text-right">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
