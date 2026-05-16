import { useSearchParams } from "react-router-dom";
import AtsPage from "../ats/AtsPage";
import SkillGapsPage from "../skill-gaps/SkillGapsPage";

type Tab = "ats" | "skill-gaps";

export default function AnalyzePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) ?? "ats";

  function setTab(t: Tab) {
    setSearchParams(t === "ats" ? {} : { tab: t }, { replace: true });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-8 pt-6 pb-0 border-b border-gray-800 shrink-0">
        <button
          onClick={() => setTab("ats")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "ats"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          ATS Score
        </button>
        <button
          onClick={() => setTab("skill-gaps")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "skill-gaps"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Skill Gaps
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "ats" ? <AtsPage /> : <SkillGapsPage />}
      </div>
    </div>
  );
}
