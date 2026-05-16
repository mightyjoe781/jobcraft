import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: "✦",
    title: "Job-first workflow",
    description: "Paste a job URL or JD. JobCraft extracts the role, tracks it in one place, and tailors your resume — all in one flow.",
  },
  {
    icon: "◆",
    title: "ATS-optimised output",
    description: "Claude rewrites bullet points, swaps keywords, and adjusts framing — without inventing experience. Score before you send.",
  },
  {
    icon: "▲",
    title: "Every application in one place",
    description: "Tailored resume, ATS score, cover letter, and skill gap analysis — all inside a single job card. No tab-switching.",
  },
  {
    icon: "◇",
    title: "Build a better base over time",
    description: "Fork any high-scoring variant into a new base resume. Your starting point improves with every application.",
  },
];

const TEMPLATES = [
  { name: "Jake's Resume", tag: "Engineering", ats: true },
  { name: "Harshibar", tag: "Engineering", ats: true },
  { name: "Deedy CV", tag: "Engineering", ats: false },
  { name: "Awesome CV", tag: "Professional", ats: true },
  { name: "ModernCV", tag: "Professional", ats: true },
  { name: "Research CV", tag: "Research", ats: true },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── Nav ── */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight text-gray-900">JobCraft</span>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full mb-8 border border-indigo-100">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          AI-powered job tracking & resume tailoring
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-[1.1]">
          Land more interviews.<br />
          <span className="text-indigo-600">One job at a time.</span>
        </h1>

        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Paste a job description. JobCraft tailors your LaTeX resume to match, scores it against ATS filters, and tracks your entire application — without inventing a single word.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Start tracking jobs →
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center text-sm text-gray-500 hover:text-gray-900 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Sign in to your workspace
          </Link>
        </div>

        {/* Pipeline preview */}
        <div className="mt-20 bg-gray-50 rounded-2xl border border-gray-200 p-1 max-w-4xl mx-auto shadow-sm">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Mock nav */}
            <div className="flex items-center border-b border-gray-100 px-4 py-2 gap-4">
              <span className="font-semibold text-sm text-gray-900">JobCraft</span>
              <div className="flex gap-1">
                {["Dashboard", "Track a Job", "Applications", "My Resumes"].map((item, i) => (
                  <span key={i} className={`text-xs px-2.5 py-1 rounded-md ${i === 1 ? "bg-indigo-600 text-white font-medium" : "text-gray-400"}`}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
            {/* Mock content */}
            <div className="p-6 grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                <div className="h-2 bg-gray-100 rounded-full w-1/3" />
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <div className="h-2 bg-indigo-200 rounded w-2/3 mb-2" />
                  <div className="h-2 bg-indigo-100 rounded w-1/2" />
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="h-2 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">84</p>
                  <p className="text-xs text-green-600">ATS Score</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="h-2 bg-gray-200 rounded mb-1.5" />
                  <div className="h-2 bg-gray-100 rounded w-3/4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything for a job application, in one place</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              No more jumping between a word processor, a PDF viewer, a spreadsheet, and a job board.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-indigo-200 hover:shadow-sm transition-all">
                <span className="text-indigo-500 text-xl mb-4 block">{f.icon}</span>
                <h3 className="text-gray-900 font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Templates ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">10 famous templates, ready to tailor</h2>
          <p className="text-gray-500">Jake's Resume, Harshibar, Deedy CV, Awesome CV, ModernCV, and more — all in LaTeX, all ATS-tested.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((t, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
              <div>
                <p className="text-gray-900 text-sm font-medium">{t.name}</p>
                <p className="text-gray-400 text-xs">{t.tag}</p>
              </div>
              {t.ats && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ATS safe</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-indigo-600 py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to start tailoring?</h2>
          <p className="text-indigo-200 mb-8">
            Self-hosted, private, and free to use. Your resumes and job data stay on your server.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold px-6 py-3 rounded-xl hover:bg-indigo-50 transition-colors text-sm"
          >
            Create your workspace →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-400">
          <span className="font-semibold text-gray-900">JobCraft</span>
          <span>Self-hosted · Open source</span>
        </div>
      </footer>
    </div>
  );
}
