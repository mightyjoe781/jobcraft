import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as resumeApi from "../../api/resumes";
import type { BaseResume } from "../../api/resumes";
import { PdfViewer } from "../../components/PdfViewer";
import { TemplatePickerModal } from "../../components/TemplatePickerModal";
import { ConfirmModal } from "../../components/ConfirmModal";

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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const navigate = useNavigate();

  // Delete confirm modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState("");
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    resumeApi.listBaseResumes().then(setResumes).finally(() => setLoading(false));
  }, []);

  function handleDelete(id: string) {
    const resume = resumes.find((r) => r.id === id);
    const variantWarn = (resume?.variant_count ?? 0) > 0
      ? ` Tailored variants linked to it will be kept but unlinked.`
      : "";
    setDeleteConfirmMsg(`Delete this base resume?${variantWarn} Snapshots will be removed. This cannot be undone.`);
    setPendingDeleteId(id);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    setDeleteOpen(false);
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeleting(id);
    try {
      await resumeApi.deleteBaseResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      const e = err as { message?: string };
      setDeleteErrorMsg(`Failed to delete: ${e.message ?? "unknown error"}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-8">
      <ConfirmModal
        open={deleteOpen}
        title="Delete base resume"
        message={deleteConfirmMsg}
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => { setDeleteOpen(false); setPendingDeleteId(null); }}
      />
      <ConfirmModal
        open={!!deleteErrorMsg}
        title="Error"
        message={deleteErrorMsg ?? ""}
        alertOnly
        onConfirm={() => setDeleteErrorMsg(null)}
        onCancel={() => setDeleteErrorMsg(null)}
      />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">My Resumes</h1>
          <p className="text-gray-500 text-sm">Base resumes you can tailor for specific jobs.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg px-4 py-2 transition-colors"
          >
            From template
          </button>
          <button
            onClick={() => navigate("/resumes/new")}
            className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-4 py-2 transition-colors"
          >
            + Upload .tex
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-xl border border-gray-200 h-40 animate-pulse" />
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-6">No resumes yet.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-5 py-2.5 transition-colors"
            >
              Start from a template
            </button>
            <button
              onClick={() => navigate("/resumes/new")}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg px-5 py-2.5 transition-colors"
            >
              Upload .tex file
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map((r) => (
            <div
              key={r.id}
              className="group bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all shadow-sm flex flex-col cursor-pointer"
              onClick={() => navigate(`/resumes/editor/${r.id}`)}
            >
              {/* Card body */}
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-gray-900 font-semibold leading-tight">{r.label}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                    {sourceLabel(r)}
                  </span>
                </div>
                <p className="text-gray-400 text-xs">
                  {r.variant_count} variant{r.variant_count !== 1 ? "s" : ""} · Updated {new Date(r.updated_at).toLocaleDateString()}
                </p>
              </div>

              {/* Footer */}
              <div
                className="px-5 py-3 border-t border-gray-100 flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  onClick={() => navigate(`/resumes/editor/${r.id}`)}
                  className="text-indigo-600 text-xs font-medium group-hover:underline cursor-pointer"
                >
                  Open editor →
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPreviewId(r.id)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => void handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deleting === r.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF preview modal */}
      {previewId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <span className="text-gray-900 font-medium">PDF Preview</span>
              <button
                onClick={() => setPreviewId(null)}
                className="text-gray-400 hover:text-gray-900 text-xl"
              >
                ×
              </button>
            </div>
            <PdfViewer
              apiPath={resumeApi.baseResumePdfUrl(previewId)}
              className="flex-1 min-h-[70vh] rounded-b-xl"
              title="Resume preview"
            />
          </div>
        </div>
      )}

      {/* Template picker modal */}
      {showTemplatePicker && (
        <TemplatePickerModal onClose={() => setShowTemplatePicker(false)} />
      )}
    </div>
  );
}
