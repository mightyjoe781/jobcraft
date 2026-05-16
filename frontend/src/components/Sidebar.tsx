import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface NavItem {
  label: string;
  to: string;
  locked?: boolean;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Template Gallery", to: "/resumes/templates" },
  { label: "My Resumes", to: "/resumes/my" },
  { label: "Variants", to: "/resumes/variants" },
  { label: "Tailor Resume", to: "/tailor" },
  { label: "ATS Score", to: "/ats" },
  { label: "Applications", to: "/applications" },
  { label: "Cover Letters", to: "/cover-letters" },
  { label: "Skill Gaps", to: "/skill-gaps" },
  { label: "Auto-Apply", to: "/auto-apply", locked: true },
  { label: "Discover Jobs", to: "/discover", locked: true },
];

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-semibold">
      {initials}
    </div>
  );
}

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col border-r border-gray-800">
      <div className="px-5 py-5 border-b border-gray-800">
        <span className="text-white font-bold text-lg tracking-tight">JobCraft</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) =>
          item.locked ? (
            <button
              key={item.to}
              onClick={() => alert("Coming soon — this feature is in development")}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-500 cursor-not-allowed text-sm"
            >
              <span>{item.label}</span>
              <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                Soon
              </span>
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "text-gray-400 hover:bg-sidebar-hover hover:text-white"
                }`
              }
            >
              <span>{item.label}</span>
              {item.badge && (
                <span className="text-xs bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-sidebar-active text-white"
                : "text-gray-400 hover:bg-sidebar-hover hover:text-white"
            }`
          }
        >
          {user && <Avatar name={user.display_name} />}
          <span className="truncate">{user?.display_name}</span>
        </NavLink>
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-sidebar-hover transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
