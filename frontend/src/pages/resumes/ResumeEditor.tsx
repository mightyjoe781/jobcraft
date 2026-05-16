import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as resumeApi from "../../api/resumes";
import type { Snapshot } from "../../api/resumes";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface CompileError {
  errors: string[];
  raw_output: string;
}

export default function ResumeEditor() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template");
  const navigate = useNavigate();

  const [tex, setTex] = useState("");
  const [label, setLabel] = useState("");
  const [resumeId, setResumeId] = useState<string | null>(id ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [compileError, setCompileError] = useState<CompileError | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAiFill, setShowAiFill] = useState(false);
  const [bgText, setBgText] = useState("");
  const [filling, setFilling] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const [sections, setSections] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNewRef = useRef(!id);

  // Load initial content
  useEffect(() => {
    async function load() {
      if (id) {
        const r = await resumeApi.getBaseResume(id);
        setTex(r.tex_source);
        setLabel(r.label);
        setPdfUrl(resumeApi.baseResumePdfUrl(id));
        const snaps = await resumeApi.listSnapshots(id);
        setSnapshots(snaps);
      } else if (templateId) {
        const { tex_source } = await resumeApi.getTemplateTex(templateId);
        setTex(tex_source);
      }
    }
    load();
  }, [id, templateId]);

  // Extract sections from tex
  useEffect(() => {
    const matches = [...tex.matchAll(/\\section\{([^}]+)\}/g)].map((m) => m[1]);
    setSections(matches);
  }, [tex]);

  const autoSave = useCallback(
    async (newTex: string) => {
      if (!resumeId) return; // not saved yet — explicit save required
      setSaveStatus("saving");
      try {
        await resumeApi.updateBaseResume(resumeId, { tex_source: newTex });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [resumeId]
  );

  function handleEditorChange(value: string | undefined) {
    const newTex = value ?? "";
    setTex(newTex);
    setSaveStatus("unsaved");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => autoSave(newTex), 2000);
  }

  async function handleExplicitSave() {
    if (!resumeId) {
      // First save — create the record
      if (!label.trim()) {
        alert("Please enter a label for this resume before saving");
        return;
      }
      setSaveStatus("saving");
      const created = await resumeApi.createBaseResume({
        label,
        source_type: templateId ? "template" : "upload",
        source_template_id: templateId ?? undefined,
        tex_source: tex,
      });
      setResumeId(created.id);
      isNewRef.current = false;
      navigate(`/resumes/editor/${created.id}`, { replace: true });
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    try {
      await resumeApi.updateBaseResume(resumeId, { tex_source: tex, label });
      const snap = await resumeApi.createSnapshot(resumeId);
      setSnapshots((prev) => [snap, ...prev]);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  async function handleRender() {
    if (!resumeId) {
      alert("Save your resume first before rendering");
      return;
    }
    setRendering(true);
    setCompileError(null);
    try {
      await resumeApi.renderBaseResume(resumeId);
      // bust cache by appending timestamp
      setPdfUrl(`${resumeApi.baseResumePdfUrl(resumeId)}?t=${Date.now()}`);
    } catch (err: unknown) {
      const e = err as { body?: { errors?: string[]; raw_output?: string } };
      if (e.body?.errors) {
        setCompileError({ errors: e.body.errors, raw_output: e.body.raw_output ?? "" });
      }
    } finally {
      setRendering(false);
    }
  }

  async function handleRestoreSnapshot(snapId: string) {
    if (!resumeId) return;
    const snap = await resumeApi.getSnapshot(resumeId, snapId);
    setTex(snap.tex_source);
    setSaveStatus("unsaved");
    setShowHistory(false);
  }

  async function handleAiFill() {
    if (!resumeId) {
      alert("Save your resume first");
      return;
    }
    setFilling(true);
    try {
      const { filled_tex } = await resumeApi.aiFill(resumeId, bgText);
      setTex(filled_tex);
      setSaveStatus("unsaved");
      setShowAiFill(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message ?? "AI fill failed");
    } finally {
      setFilling(false);
    }
  }

  const saveStatusLabel: Record<SaveStatus, string> = {
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Save error",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Resume label (e.g. SDE, Data Engineer)"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm w-56 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span
          className={`text-xs ${
            saveStatus === "saved"
              ? "text-gray-500"
              : saveStatus === "unsaved"
              ? "text-yellow-400"
              : saveStatus === "error"
              ? "text-red-400"
              : "text-gray-400"
          }`}
        >
          {saveStatusLabel[saveStatus]}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAiFill(true)}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          AI Fill
        </button>
        <button
          onClick={() => setShowSections(!showSections)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sections
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          History
        </button>
        <button
          onClick={handleRender}
          disabled={rendering}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-1.5 transition-colors"
        >
          {rendering ? "Rendering…" : "Render Preview"}
        </button>
        <button
          onClick={handleExplicitSave}
          className="bg-accent hover:bg-accent-hover text-white text-sm rounded-lg px-4 py-1.5 transition-colors"
        >
          Save
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sections nav */}
        {showSections && sections.length > 0 && (
          <div className="w-44 bg-gray-900 border-r border-gray-800 p-3 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Sections</p>
            {sections.map((s, i) => (
              <button
                key={i}
                className="block w-full text-left text-sm text-gray-400 hover:text-white py-1 px-2 rounded hover:bg-gray-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Monaco editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Editor
            height="100%"
            language="latex"
            theme="vs-dark"
            value={tex}
            onChange={handleEditorChange}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: "on",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
            }}
          />
          {compileError && (
            <details className="bg-red-950 border-t border-red-800 p-3 text-xs text-red-300 max-h-36 overflow-auto">
              <summary className="cursor-pointer font-medium mb-1">
                LaTeX compile errors ({compileError.errors.length})
              </summary>
              {compileError.errors.map((e, i) => (
                <div key={i} className="font-mono">{e}</div>
              ))}
              <pre className="mt-2 text-gray-400 whitespace-pre-wrap">{compileError.raw_output}</pre>
            </details>
          )}
        </div>

        {/* PDF preview */}
        <div className="w-[48%] bg-gray-950 border-l border-gray-800 flex items-center justify-center">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full" title="PDF preview" />
          ) : (
            <div className="text-center text-gray-600">
              <p className="text-sm">Click "Render Preview" to compile your LaTeX</p>
            </div>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="absolute right-[48%] top-16 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-white text-sm font-medium">Save history</span>
            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">×</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {snapshots.length === 0 ? (
              <p className="text-gray-500 text-sm px-4 py-3">No snapshots yet. Use Ctrl+S to save.</p>
            ) : (
              snapshots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleRestoreSnapshot(s.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors border-b border-gray-800/50"
                >
                  <p className="text-white text-sm">
                    {new Date(s.saved_at).toLocaleDateString()}{" "}
                    {new Date(s.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* AI Fill drawer */}
      {showAiFill && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-medium">AI Fill — paste your background</h2>
              <button onClick={() => setShowAiFill(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-gray-400 text-sm">
                Paste your LinkedIn bio, old resume text, or a freeform description of your experience.
                Claude will fill in the template placeholders — it won't invent anything.
              </p>
              <textarea
                value={bgText}
                onChange={(e) => setBgText(e.target.value)}
                rows={8}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="10+ years as a backend engineer at Stripe and Shopify, specialised in payments infrastructure..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAiFill(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAiFill}
                  disabled={filling || bgText.trim().length < 20}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {filling ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
