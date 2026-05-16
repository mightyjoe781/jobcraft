import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as tailorApi from "../../api/tailor";
import * as resumeApi from "../../api/resumes";
import { PdfViewer, PdfDownloadLink } from "../../components/PdfViewer";
import type { BaseResume } from "../../api/resumes";

const AGGRESSIVENESS = [
  { value: "conservative", label: "Conservative", desc: "Reorder bullets, swap synonyms only" },
  { value: "balanced", label: "Balanced", desc: "Rewrite up to 30% of bullets" },
  { value: "aggressive", label: "Aggressive", desc: "Rewrite bullets, strengthen verbs" },
] as const;

type ProgressStep = { message: string; done: boolean };

export default function TailorPage() {
  const navigate = useNavigate();
  const [bases, setBases] = useState<BaseResume[]>([]);
  const [baseId, setBaseId] = useState("");
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [aggressiveness, setAggressiveness] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [customInstruction, setCustomInstruction] = useState("");
  const [fetchingJd, setFetchingJd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    resumeApi.listBaseResumes().then((r) => {
      setBases(r);
      if (r.length) setBaseId(r[0].id);
    });
    return () => eventSourceRef.current?.close();
  }, []);

  async function handleFetchJd() {
    if (!jdUrl.trim()) return;
    setFetchingJd(true);
    try {
      const result = await tailorApi.fetchJd(jdUrl);
      setJdText(result.jd_text);
      if (result.company) setCompany(result.company);
      if (result.role_title) setRoleTitle(result.role_title);
    } catch {
      setError("Could not fetch the job description from that URL");
    } finally {
      setFetchingJd(false);
    }
  }

  function addStep(message: string) {
    setSteps((prev) => [...prev.map((s) => ({ ...s, done: true })), { message, done: false }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!baseId) { setError("Select a base resume"); return; }
    if (!jdText.trim()) { setError("Add a job description"); return; }
    if (!company.trim() || !roleTitle.trim()) { setError("Company and role title are required"); return; }

    setError(null);
    setSubmitting(true);
    setSteps([]);

    try {
      const job = await tailorApi.createJob({ company, role_title: roleTitle, jd_text: jdText, jd_url: jdUrl || undefined });
      const res = await tailorApi.startTailoring({
        base_resume_id: baseId,
        job_id: job.id,
        aggressiveness,
        custom_instruction: customInstruction || undefined,
      });

      setVariantId(res.variant_id);
      setStreaming(true);

      const es = new EventSource(`/api/tailor/stream/${res.variant_id}`);
      eventSourceRef.current = es;

      es.addEventListener("progress", (e) => {
        const data = JSON.parse(e.data);
        addStep(data.message);
      });

      es.addEventListener("diff_ready", () => {
        addStep("Compiling PDF…");
      });

      es.addEventListener("pdf_ready", () => {
        setPdfReady(true);
        setStreaming(false);
        es.close();
      });

      es.addEventListener("error", (e) => {
        const data = JSON.parse((e as MessageEvent).data ?? "{}");
        setError(data.message ?? "Tailoring failed");
        setStreaming(false);
        es.close();
      });

      es.onerror = () => {
        if (!pdfReady) {
          setError("Lost connection to server");
          setStreaming(false);
        }
        es.close();
      };
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Failed to start tailoring");
    } finally {
      setSubmitting(false);
    }
  }

  if (pdfReady && variantId) {
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="w-80 shrink-0 p-6 bg-gray-900 border-r border-gray-800 flex flex-col gap-4 overflow-y-auto">
          <h2 className="text-white font-semibold">Tailoring complete</h2>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-green-400 shrink-0">✓</span>
                <span className="text-gray-300">{s.message}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto space-y-2">
            <PdfDownloadLink
              apiPath={resumeApi.variantPdfUrl(variantId)}
              filename="tailored-resume.pdf"
              className="block w-full bg-accent hover:bg-accent-hover text-white text-sm rounded-lg py-2.5 text-center transition-colors"
            >
              Download PDF
            </PdfDownloadLink>
            <button
              onClick={() => navigate(`/ats?variant=${variantId}`)}
              className="block w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2.5 text-center transition-colors"
            >
              Score ATS
            </button>
            <button
              onClick={() => navigate("/skill-gaps")}
              className="block w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2.5 text-center transition-colors"
            >
              Skill gap analysis
            </button>
            <button
              onClick={() => { setStreaming(false); setPdfReady(false); setSteps([]); setVariantId(null); }}
              className="block w-full text-gray-500 hover:text-white text-sm py-2 transition-colors"
            >
              Tailor another
            </button>
          </div>
        </div>
        <PdfViewer
          apiPath={resumeApi.variantPdfUrl(variantId)}
          className="flex-1"
          title="Tailored resume"
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Tailor Resume</h1>
      <p className="text-gray-400 text-sm mb-8">
        Claude adapts your resume to match the job description — without inventing anything.
      </p>

      {streaming ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 space-y-4">
          <h2 className="text-white font-medium">Tailoring in progress…</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {step.done ? (
                  <span className="text-green-400 shrink-0">✓</span>
                ) : (
                  <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className={step.done ? "text-gray-400" : "text-white"}>{step.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Base resume</label>
            {bases.length === 0 ? (
              <p className="text-sm text-gray-500">
                No base resumes yet.{" "}
                <a href="/resumes/my" className="text-accent hover:underline">Create one first.</a>
              </p>
            ) : (
              <select
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Stripe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Role title</label>
              <input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Senior Data Engineer"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-300">Job description</label>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Paste job posting URL (optional)"
              />
              <button
                type="button"
                onClick={handleFetchJd}
                disabled={fetchingJd || !jdUrl.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm rounded-lg px-4 py-2 transition-colors shrink-0"
              >
                {fetchingJd ? "Fetching…" : "Fetch"}
              </button>
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={10}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Paste the full job description here…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Aggressiveness</label>
            <div className="space-y-2">
              {AGGRESSIVENESS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    aggressiveness === opt.value ? "border-accent bg-accent/10" : "border-gray-700 hover:border-gray-600"
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

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Custom instruction <span className="text-gray-500">(optional)</span>
            </label>
            <input
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              maxLength={500}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g. emphasise distributed systems experience"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || bases.length === 0}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
          >
            {submitting ? "Starting…" : "Tailor resume"}
          </button>
        </form>
      )}
    </div>
  );
}
