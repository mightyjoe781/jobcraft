import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface NavItem {
  label: string;
  to: string;
  locked?: boolean;
  badge?: string;
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Apply to Job", to: "/apply", primary: true },
  { label: "Applications", to: "/applications" },
  { label: "My Resumes", to: "/resumes" },
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

const ADMIN_NAV_ITEM: NavItem = { label: "Admin", to: "/admin" };

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <aside className="w-60 h-screen sticky top-0 bg-sidebar flex flex-col border-r border-gray-200">
      <div className="px-5 py-5 border-b border-gray-200 shrink-0">
        <span className="text-gray-900 font-bold text-lg tracking-tight">JobCraft</span>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-0.5">
        {[...NAV_ITEMS, ...(user?.is_admin ? [ADMIN_NAV_ITEM] : [])].map((item) =>
          item.locked ? (
            <div key={item.to} className="relative group">
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-300 cursor-not-allowed text-sm"
              >
                <span>{item.label}</span>
                <span className="text-xs bg-gray-100 text-gray-300 px-1.5 py-0.5 rounded">Soon</span>
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                Coming soon
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
              </div>
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => {
                if (item.primary) {
                  return `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-accent hover:bg-accent/10"
                  }`;
                }
                return `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-active text-indigo-700"
                    : "text-gray-600 hover:bg-sidebar-hover hover:text-gray-900"
                }`;
              }}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-200 space-y-1 shrink-0">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-sidebar-active text-indigo-700"
                : "text-gray-600 hover:bg-sidebar-hover hover:text-gray-900"
            }`
          }
        >
          {user && <Avatar name={user.display_name} />}
          <span className="truncate">{user?.display_name}</span>
        </NavLink>
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-sidebar-hover transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
