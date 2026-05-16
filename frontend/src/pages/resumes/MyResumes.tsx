import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as resumeApi from "../../api/resumes";
import type { BaseResume } from "../../api/resumes";
import { PdfViewer } from "../../components/PdfViewer";

function sourceLabel(r: BaseResume): string {
  if (r.source_type === "template") return "From template";
  if (r.source_type === "forked_variant") return "Forked";
  return "Uploaded";
}

export default function MyResumes() {
  const [resumes, setResumes] = useState<BaseResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    resumeApi.listBaseResumes().then(setResumes).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this base resume? All snapshots will be removed. Variants are kept.")) return;
    setDeleting(id);
    await resumeApi.deleteBaseResume(id);
    setResumes((prev) => prev.filter((r) => r.id !== id));
    setDeleting(null);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">My Resumes</h1>
          <p className="text-gray-400 text-sm">Base resumes you can tailor for specific jobs.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/resumes/templates"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg px-4 py-2 transition-colors"
          >
            Browse templates
          </Link>
          <Link
            to="/resumes/new"
            className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-4 py-2 transition-colors"
          >
            + New resume
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-40 animate-pulse" />
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No resumes yet.</p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/resumes/templates"
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-5 py-2.5 transition-colors"
            >
              Start from a template
            </Link>
            <Link
              to="/resumes/new"
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg px-5 py-2.5 transition-colors"
            >
              Upload .tex file
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map((r) => (
            <div
              key={r.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col gap-3 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-semibold truncate">{r.label}</h3>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded shrink-0">
                  {sourceLabel(r)}
                </span>
              </div>
              <p className="text-gray-500 text-xs">
                {r.variant_count} variant{r.variant_count !== 1 ? "s" : ""} ·{" "}
                Updated {new Date(r.updated_at).toLocaleDateString()}
              </p>
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => navigate(`/resumes/editor/${r.id}`)}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg py-1.5 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setPreviewId(r.id)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                  className="bg-gray-800 hover:bg-red-900/40 text-gray-500 hover:text-red-400 text-sm rounded-lg px-3 py-1.5 transition-colors"
                >
                  {deleting === r.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewId && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <span className="text-white font-medium">PDF Preview</span>
              <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <PdfViewer
              apiPath={resumeApi.baseResumePdfUrl(previewId)}
              className="flex-1 min-h-[70vh] rounded-b-xl"
              title="Resume preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
