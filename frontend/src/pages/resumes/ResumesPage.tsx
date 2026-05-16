import { useSearchParams } from "react-router-dom";
import MyResumes from "./MyResumes";
import VariantHistory from "./VariantHistory";

type Tab = "base" | "variants";

export default function ResumesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) ?? "base";

  function setTab(t: Tab) {
    setSearchParams(t === "base" ? {} : { tab: t }, { replace: true });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-8 pt-6 pb-0 border-b border-gray-800 shrink-0">
        <button
          onClick={() => setTab("base")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "base"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          My Resumes
        </button>
        <button
          onClick={() => setTab("variants")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "variants"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Tailored Variants
        </button>
      </div>

      {/* Tab content — each child handles its own padding */}
      <div className="flex-1 overflow-auto">
        {tab === "base" ? <MyResumes /> : <VariantHistory />}
      </div>
    </div>
  );
}
