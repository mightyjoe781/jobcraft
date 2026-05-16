import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ComingSoonPage from "./pages/coming-soon/ComingSoonPage";
import ProfilePage from "./pages/profile/ProfilePage";
import ResumesPage from "./pages/resumes/ResumesPage";
import ResumeEditor from "./pages/resumes/ResumeEditor";
import TailorPage from "./pages/tailor/TailorPage";
import AnalyzePage from "./pages/analyze/AnalyzePage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import CoverLettersPage from "./pages/cover-letters/CoverLettersPage";

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="text-gray-400 mt-2">This module is being built.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Resumes — tabbed: My Resumes | Variants */}
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/resumes/new" element={<ResumeEditor />} />
        <Route path="/resumes/editor/:id" element={<ResumeEditor />} />

        {/* Legacy redirects so old bookmarks/links don't 404 */}
        <Route path="/resumes/my" element={<Navigate to="/resumes" replace />} />
        <Route path="/resumes/templates" element={<Navigate to="/resumes" replace />} />
        <Route path="/resumes/variants" element={<Navigate to="/resumes?tab=variants" replace />} />
        <Route path="/ats" element={<Navigate to="/analyze" replace />} />
        <Route path="/skill-gaps" element={<Navigate to="/analyze?tab=skill-gaps" replace />} />

        <Route path="/tailor" element={<TailorPage />} />

        {/* Analyze — tabbed: ATS Score | Skill Gaps */}
        <Route path="/analyze" element={<AnalyzePage />} />

        <Route path="/cover-letters" element={<CoverLettersPage />} />
        <Route path="/applications" element={<PlaceholderPage title="Applications" />} />

        <Route
          path="/auto-apply"
          element={
            <ComingSoonPage
              feature="Auto-Apply"
              description="Automatically submit tailored applications to Greenhouse, Lever, and Ashby roles."
              phase="Phase 4 — Coming Soon"
            />
          }
        />
        <Route
          path="/discover"
          element={
            <ComingSoonPage
              feature="Discover Jobs"
              description="Saved searches and notifications for new roles matching your criteria."
              phase="Phase 5 — Coming Soon"
            />
          }
        />

        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
