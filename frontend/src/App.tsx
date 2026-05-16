import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ComingSoonPage from "./pages/coming-soon/ComingSoonPage";
import ProfilePage from "./pages/profile/ProfilePage";
import TemplateGallery from "./pages/resumes/TemplateGallery";
import MyResumes from "./pages/resumes/MyResumes";
import ResumeEditor from "./pages/resumes/ResumeEditor";
import VariantHistory from "./pages/resumes/VariantHistory";
import TailorPage from "./pages/tailor/TailorPage";
import AtsPage from "./pages/ats/AtsPage";
import SkillGapsPage from "./pages/skill-gaps/SkillGapsPage";
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

        <Route
          path="/dashboard"
          element={
            <DashboardPage />
          }
        />

        <Route path="/resumes/templates" element={<TemplateGallery />} />
        <Route path="/resumes/my" element={<MyResumes />} />
        <Route path="/resumes/new" element={<ResumeEditor />} />
        <Route path="/resumes/editor/:id" element={<ResumeEditor />} />
        <Route path="/resumes/variants" element={<VariantHistory />} />

        <Route path="/tailor" element={<TailorPage />} />
        <Route path="/ats" element={<AtsPage />} />
        <Route path="/applications" element={<PlaceholderPage title="Applications" />} />

        <Route path="/cover-letters" element={<CoverLettersPage />} />
        <Route path="/skill-gaps" element={<SkillGapsPage />} />
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
        <Route path="*" element={<Navigate to="/resumes/my" replace />} />
      </Route>
    </Routes>
  );
}
