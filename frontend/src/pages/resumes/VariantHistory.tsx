import { useEffect, useState } from "react";
import * as resumeApi from "../../api/resumes";
import type { DiffOut, Variant } from "../../api/resumes";
import { PdfDownloadLink, PdfViewer } from "../../components/PdfViewer";

function AtsScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-600 text-xs">—</span>;
  const color =
    score >= 70 ? "bg-green-900/40 text-green-400" :
    score >= 50 ? "bg-yellow-900/40 text-yellow-400" :
    "bg-red-900/40 text-red-400";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>{score}</span>;
}

export default function VariantHistory() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewVariant, setPreviewVariant] = useState<Variant | null>(null);
  const [diffVariant, setDiffVariant] = useState<Variant | null>(null);
  const [diff, setDiff] = useState<DiffOut | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    resumeApi.listVariants().then(setVariants).finally(() => setLoading(false));
  }, []);

  async function handleViewDiff(v: Variant) {
    setDiffVariant(v);
    setDiff(null);
    setDiffLoading(true);
    try {
      const d = await resumeApi.getVariantDiff(v.id);
      setDiff(d);
    } finally {
      setDiffLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this variant? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await resumeApi.deleteVariant(id);
      setVariants((prev) => prev.filter((v) => v.id !== id));
    } catch {
      alert("Failed to delete variant");
    } finally {
      setDeleting(null);
    }
  }

  async function handleForkAsBase(v: Variant) {
    const label = prompt("Label for new base resume:", `${v.company ?? "Unknown"} fork`);
    if (!label) return;
    try {
      const diff = await resumeApi.getVariantDiff(v.id);
      await resumeApi.createBaseResume({
        label,
        source_type: "forked_variant",
        source_variant_id: v.id,
        tex_source: diff.modified_tex,
      });
      alert("Forked — go to My Resumes to edit it");
    } catch {
      alert("Fork failed");
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Tailored Variants</h1>
      <p className="text-gray-400 text-sm mb-6">All AI-tailored resumes generated from your base resumes.</p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-16 animate-pulse" />
          ))}
        </div>
      ) : variants.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-2">No variants yet.</p>
          <p className="text-gray-600 text-sm">Use Tailor Resume to generate your first tailored output.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Job</th>
                <th className="px-4 py-3 text-left">ATS</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {variants.map((v) => (
                <tr key={v.id} className="bg-gray-900 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">
                      {v.label ?? `${v.company ?? "Unknown"} — ${v.role_title ?? "Role"}`}
                    </p>
                    {v.company && (
                      <p className="text-gray-500 text-xs">{v.company} · {v.role_title}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AtsScoreBadge score={v.ats_score} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(v.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end items-center">
                      <button
                        onClick={() => setPreviewVariant(v)}
                        className="text-xs text-accent hover:underline"
                      >
                        Preview
                      </button>
                      <PdfDownloadLink
                        apiPath={resumeApi.variantPdfUrl(v.id)}
                        filename={`${v.company ?? "resume"}-${v.role_title ?? "variant"}.pdf`}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Download
                      </PdfDownloadLink>
                      <button
                        onClick={() => handleViewDiff(v)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Diff
                      </button>
                      <button
                        onClick={() => handleForkAsBase(v)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Fork
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        disabled={deleting === v.id}
                        className="text-xs text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        {deleting === v.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PDF Preview modal */}
      {previewVariant && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
          onClick={() => setPreviewVariant(null)}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
              <span className="text-white font-medium text-sm">
                {previewVariant.company} — {previewVariant.role_title}
              </span>
              <div className="flex items-center gap-3">
                <PdfDownloadLink
                  apiPath={resumeApi.variantPdfUrl(previewVariant.id)}
                  filename={`${previewVariant.company ?? "resume"}.pdf`}
                  className="text-xs text-accent hover:underline"
                >
                  Download PDF
                </PdfDownloadLink>
                <button
                  onClick={() => setPreviewVariant(null)}
                  className="text-gray-400 hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            <PdfViewer
              apiPath={resumeApi.variantPdfUrl(previewVariant.id)}
              className="flex-1 min-h-[70vh] rounded-b-xl"
              title="Variant preview"
            />
          </div>
        </div>
      )}

      {/* Diff modal */}
      {diffVariant && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
          onClick={() => setDiffVariant(null)}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-5xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-medium text-sm">
                Diff — {diffVariant.label ?? diffVariant.company}
              </h2>
              <button onClick={() => setDiffVariant(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="flex-1 overflow-hidden flex">
              {diffLoading ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading diff…</div>
              ) : diff ? (
                <>
                  <div className="flex-1 overflow-auto p-4 border-r border-gray-800">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Original</p>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-5">
                      {diff.original_tex}
                    </pre>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Modified</p>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-5">
                      {diff.modified_tex}
                    </pre>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
