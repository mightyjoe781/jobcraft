import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import LandingPage from "./pages/landing/LandingPage";
import ComingSoonPage from "./pages/coming-soon/ComingSoonPage";
import ProfilePage from "./pages/profile/ProfilePage";
import ResumesPage from "./pages/resumes/ResumesPage";
import ResumeEditor from "./pages/resumes/ResumeEditor";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ApplicationsPage from "./pages/applications/ApplicationsPage";
import ApplyPage from "./pages/apply/ApplyPage";
import { useAuth } from "./hooks/useAuth";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
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

        <Route path="/apply" element={<ApplyPage />} />

        {/* Resumes */}
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/resumes/new" element={<ResumeEditor />} />
        <Route path="/resumes/editor/:id" element={<ResumeEditor />} />

        {/* Legacy redirects so old bookmarks/links don't 404 */}
        <Route path="/resumes/my" element={<Navigate to="/resumes" replace />} />
        <Route path="/resumes/templates" element={<Navigate to="/resumes" replace />} />
        <Route path="/resumes/variants" element={<Navigate to="/resumes?tab=variants" replace />} />
        <Route path="/tailor" element={<Navigate to="/apply" replace />} />
        <Route path="/ats" element={<Navigate to="/applications" replace />} />
        <Route path="/analyze" element={<Navigate to="/applications" replace />} />
        <Route path="/skill-gaps" element={<Navigate to="/applications" replace />} />
        <Route path="/cover-letters" element={<Navigate to="/applications" replace />} />

        <Route path="/applications" element={<ApplicationsPage />} />

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
