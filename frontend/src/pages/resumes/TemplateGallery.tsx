import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as resumeApi from "../../api/resumes";

const CATEGORIES = ["all", "engineering", "data", "research", "general"] as const;

function Atsbadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        ok ? "bg-green-900/40 text-green-400" : "bg-yellow-900/40 text-yellow-400"
      }`}
    >
      {ok ? "ATS friendly" : "ATS: caution"}
    </span>
  );
}

export default function TemplateGallery() {
  const [templates, setTemplates] = useState<resumeApi.Template[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [preview, setPreview] = useState<resumeApi.Template | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    resumeApi.listTemplates().then(setTemplates).finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? templates : templates.filter((t) => t.category === filter);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Template Gallery</h1>
      <p className="text-gray-400 text-sm mb-6">
        Choose a starting point — you can edit everything in the LaTeX editor.
      </p>

      <div className="flex gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              filter === cat
                ? "bg-accent text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tmpl) => (
            <div
              key={tmpl.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col gap-3 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-semibold">{tmpl.name}</h3>
                <Atsbage ok={tmpl.is_ats_friendly} />
              </div>
              <p className="text-gray-400 text-sm flex-1">{tmpl.description}</p>
              <span className="text-xs text-gray-500 capitalize bg-gray-800 px-2 py-0.5 rounded w-fit">
                {tmpl.category}
              </span>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setPreview(tmpl)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => navigate(`/resumes/new?template=${tmpl.id}`)}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg py-2 transition-colors"
                >
                  Use template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">{preview.name}</h2>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-white text-xl">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-xl">
              <iframe
                src={resumeApi.templatePdfUrl(preview.id)}
                className="w-full h-full min-h-[70vh]"
                title={`Preview of ${preview.name}`}
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setPreview(null);
                  navigate(`/resumes/new?template=${preview.id}`);
                }}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
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

// fix typo in JSX
function Atsbage({ ok }: { ok: boolean }) {
  return <Atsbadge ok={ok} />;
}
