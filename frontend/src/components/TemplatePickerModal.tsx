import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as resumeApi from "../api/resumes";
import { PdfViewer } from "./PdfViewer";
import type { Template } from "../api/resumes";

const CATEGORIES = ["all", "engineering", "professional", "general", "creative", "research"] as const;

interface Props {
  onClose: () => void;
}

export function TemplatePickerModal({ onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [preview, setPreview] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    resumeApi.listTemplates().then(setTemplates).finally(() => setLoading(false));
  }, []);

  function handleUse(tmpl: Template) {
    onClose();
    navigate(`/resumes/new?template=${tmpl.id}`);
  }

  const filtered =
    filter === "all" ? templates : templates.filter((t) => t.category === filter);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-gray-900 font-semibold">Choose a template</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              All templates are editable in the LaTeX editor after selection.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 px-6 py-3 border-b border-gray-200 shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 rounded-lg text-xs capitalize transition-colors ${
                filter === cat
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-gray-500 hover:text-gray-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-200 rounded-xl h-44 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-gray-900 text-sm font-medium">{tmpl.name}</h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        tmpl.is_ats_friendly
                          ? "bg-green-50 text-green-700"
                          : "bg-yellow-50 text-yellow-700"
                      }`}
                    >
                      {tmpl.is_ats_friendly ? "ATS safe" : "ATS caution"}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs flex-1">{tmpl.description}</p>
                  <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-0.5 rounded w-fit">
                    {tmpl.category}
                  </span>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setPreview(tmpl)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg py-1.5 transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleUse(tmpl)}
                      className="flex-1 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg py-1.5 transition-colors"
                    >
                      Use template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nested preview modal */}
      {preview && (
        <div
          className="absolute inset-0 bg-black/40 flex items-center justify-center p-8 z-10"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
              <span className="text-gray-900 font-medium text-sm">{preview.name}</span>
              <button
                onClick={() => setPreview(null)}
                className="text-gray-400 hover:text-gray-900 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <PdfViewer
              apiPath={resumeApi.templatePdfUrl(preview.id)}
              className="flex-1 min-h-[65vh] rounded-b-xl"
              title={`Preview — ${preview.name}`}
            />
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => handleUse(preview)}
                className="text-sm bg-accent hover:bg-accent-hover text-white rounded-lg px-4 py-1.5 transition-colors"
              >
                Use template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
