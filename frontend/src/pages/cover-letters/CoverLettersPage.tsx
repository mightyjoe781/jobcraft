import { useEffect, useState } from "react";
import * as coverLetterApi from "../../api/coverLetters";
import * as tailorApi from "../../api/tailor";
import * as resumeApi from "../../api/resumes";
import { PdfDownloadLink } from "../../components/PdfViewer";
import type { CoverLetter, CoverLetterTone } from "../../api/coverLetters";
import type { Job } from "../../api/tailor";
import type { Variant } from "../../api/resumes";

const TONES: { value: CoverLetterTone; label: string; desc: string }[] = [
  { value: "formal", label: "Formal", desc: "Professional and precise" },
  { value: "conversational", label: "Conversational", desc: "Warm and direct" },
  { value: "enthusiastic", label: "Enthusiastic", desc: "Energetic and genuine" },
];

function SavedList({
  letters,
  onSelect,
  onDelete,
}: {
  letters: CoverLetter[];
  onSelect: (cl: CoverLetter) => void;
  onDelete: (id: string) => void;
}) {
  if (letters.length === 0) return null;
  return (
    <div className="mt-10">
      <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Saved cover letters</h2>
      <div className="space-y-2">
        {letters.map((cl) => (
          <div
            key={cl.id}
            className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 hover:border-gray-300 transition-colors shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-gray-900 text-sm font-medium truncate">
                {cl.company ?? "Unknown company"} — {cl.role_title ?? "Unknown role"}
              </p>
              <p className="text-gray-400 text-xs mt-0.5 capitalize">
                {cl.tone} · {new Date(cl.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onSelect(cl)}
                className="text-xs text-accent hover:underline"
              >
                Edit
              </button>
              <PdfDownloadLink
                apiPath={coverLetterApi.coverLetterPdfPath(cl.id)}
                filename={`cover-letter-${cl.company ?? "unknown"}.pdf`}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                PDF
              </PdfDownloadLink>
              <button
                onClick={() => onDelete(cl.id)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoverLettersPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [letters, setLetters] = useState<CoverLetter[]>([]);

  // Form state
  const [jobId, setJobId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [tone, setTone] = useState<CoverLetterTone>("formal");
  const [personalHook, setPersonalHook] = useState("");

  // Editor state
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      tailorApi.listJobs(),
      resumeApi.listVariants(),
      coverLetterApi.listCoverLetters(),
    ]).then(([j, v, cl]) => {
      setJobs(j);
      setVariants(v);
      setLetters(cl);
      if (j.length) setJobId(j[0].id);
    });
  }, []);

  function handleSelectSaved(cl: CoverLetter) {
    setActiveLetterId(cl.id);
    setEditorText(cl.body_text);
    setError(null);
  }

  async function handleGenerate() {
    if (!jobId) { setError("Select a job first"); return; }
    setError(null);
    setGenerating(true);
    setEditorText("");
    setActiveLetterId(null);

    try {
      let newId: string | null = null;
      let accumulated = "";

      for await (const event of coverLetterApi.streamGenerate({
        job_id: jobId,
        resume_variant_id: variantId || undefined,
        tone,
        personal_hook: personalHook.trim() || undefined,
      })) {
        if (event.type === "id") {
          newId = event.data.cover_letter_id;
          setActiveLetterId(newId);
        } else if (event.type === "chunk") {
          accumulated += event.data.text ?? "";
          setEditorText(accumulated);
        } else if (event.type === "done") {
          // Refresh list
          const fresh = await coverLetterApi.listCoverLetters();
          setLetters(fresh);
        } else if (event.type === "error") {
          setError(event.data.message ?? "Generation failed");
          break;
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!activeLetterId) return;
    setSaving(true);
    try {
      await coverLetterApi.updateCoverLetter(activeLetterId, editorText);
      const fresh = await coverLetterApi.listCoverLetters();
      setLetters(fresh);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this cover letter?")) return;
    await coverLetterApi.deleteCoverLetter(id);
    setLetters((prev) => prev.filter((cl) => cl.id !== id));
    if (activeLetterId === id) {
      setActiveLetterId(null);
      setEditorText("");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const editorOpen = editorText.length > 0 || generating;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel — form */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-gray-900 font-bold text-lg">Cover Letters</h1>
          <p className="text-gray-500 text-xs mt-1">AI-generated, targeted to each role</p>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Job</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {jobs.length === 0 && <option value="">No jobs yet</option>}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.company} — {j.role_title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Resume variant <span className="text-gray-400">(optional)</span>
            </label>
            <select
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">No variant — use JD only</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label ?? `${v.company ?? "?"} — ${v.role_title ?? "?"}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Tone</label>
            <div className="space-y-1.5">
              {TONES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    tone === t.value ? "border-accent bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="tone"
                    value={t.value}
                    checked={tone === t.value}
                    onChange={() => setTone(t.value)}
                    className="accent-[#4f46e5]"
                  />
                  <div>
                    <p className="text-gray-900 text-xs font-medium">{t.label}</p>
                    <p className="text-gray-400 text-xs">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Personal hook <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={personalHook}
              onChange={(e) => setPersonalHook(e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g. I met the CTO at PyCon — or a specific reason you're excited about this company"
            />
            <p className="text-gray-400 text-xs mt-1 text-right">{personalHook.length}/300</p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !jobId}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Writing…
              </span>
            ) : "Generate"}
          </button>
        </div>

        <div className="p-5 border-t border-gray-200">
          <SavedList letters={letters} onSelect={handleSelectSaved} onDelete={handleDelete} />
        </div>
      </div>

      {/* Right panel — editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!editorOpen ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <p className="text-gray-400 text-sm mb-1">No cover letter yet</p>
            <p className="text-gray-400 text-xs">Select a job and click Generate</p>
          </div>
        ) : (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-2 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
              <span className="text-gray-500 text-sm flex-1">
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Claude is writing…
                  </span>
                ) : activeLetterId ? "Edit your cover letter" : ""}
              </span>
              <button
                onClick={handleCopy}
                disabled={!editorText || generating}
                className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
              >
                {copied ? "Copied!" : "Copy text"}
              </button>
              {activeLetterId && (
                <PdfDownloadLink
                  apiPath={coverLetterApi.coverLetterPdfPath(activeLetterId)}
                  filename="cover-letter.pdf"
                  className="text-xs text-gray-500 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
                >
                  Export PDF
                </PdfDownloadLink>
              )}
              <button
                onClick={handleSave}
                disabled={saving || generating || !activeLetterId}
                className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg px-4 py-1.5 transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            {/* Textarea editor */}
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              disabled={generating}
              className="flex-1 bg-gray-50 text-gray-900 text-sm leading-7 resize-none focus:outline-none px-10 py-8 font-serif disabled:opacity-80"
              placeholder="Your cover letter will appear here…"
              style={{ fontFamily: "Georgia, serif", fontSize: "13px" }}
            />

            {/* Word count */}
            {editorText && (
              <div className="px-10 py-2 border-t border-gray-200 flex justify-end">
                <span className="text-gray-400 text-xs">
                  {editorText.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
