import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "../../api/auth";
import { clearTokens } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";

const PREFERENCE_OPTIONS = [
  {
    value: "conservative",
    label: "Conservative",
    description: "Reorder bullets and swap synonyms only",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Rewrite up to 30% of bullets for better JD match",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Rewrite bullets, strengthen verbs, add quantification hints",
  },
] as const;

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-semibold">
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [preference, setPreference] = useState(user?.tailoring_preference ?? "balanced");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await authApi.updateMe({ display_name: displayName, tailoring_preference: preference });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      await authApi.deleteMe();
      clearTokens();
      navigate("/login");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-8">Profile</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={user.display_name} />
          <div>
            <p className="text-white font-semibold text-lg">{user.display_name}</p>
            <p className="text-gray-400 text-sm">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default tailoring preference
            </label>
            <div className="space-y-2">
              {PREFERENCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    preference === opt.value
                      ? "border-accent bg-accent/10"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="preference"
                    value={opt.value}
                    checked={preference === opt.value}
                    onChange={() => setPreference(opt.value)}
                    className="mt-0.5 accent-[#6366f1]"
                  />
                  <div>
                    <p className="text-white text-sm font-medium">{opt.label}</p>
                    <p className="text-gray-400 text-xs">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg px-6 py-2.5 transition-colors text-sm"
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        </form>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <h2 className="text-gray-300 font-medium mb-3">Linked accounts</h2>
        <div className="flex items-center justify-between p-3 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-700 rounded" />
            <span className="text-gray-400 text-sm">Google OAuth</span>
          </div>
          <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">Coming soon</span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-red-900/40 p-6">
        <h2 className="text-red-400 font-medium mb-2">Danger zone</h2>
        <p className="text-gray-400 text-sm mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Type <span className="font-mono text-red-400">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
              placeholder="DELETE"
            />
          </div>
          <button
            onClick={handleDelete}
            disabled={deleteConfirm !== "DELETE" || deleting}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
