import { apiFetch } from "./client";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  is_disabled: boolean;
  created_at: string;
}

export interface Invite {
  token: string;
  token_masked: string;
  remaining_seconds: number;
  expires_at: number;
}

export const getRegistrationToken = () =>
  apiFetch<{ token: string; type: string }>("/admin/registration-token");

export const createInvite = (hours: number) =>
  apiFetch<{ token: string; expires_in_hours: number }>("/admin/invite", {
    method: "POST",
    body: JSON.stringify({ hours }),
  });

export const listInvites = () => apiFetch<Invite[]>("/admin/invites");

export const revokeInvite = (token: string) =>
  apiFetch<void>(`/admin/invites/${encodeURIComponent(token)}`, { method: "DELETE" });

export const listUsers = () => apiFetch<AdminUser[]>("/admin/users");

export const disableUser = (id: string) =>
  apiFetch<AdminUser>(`/admin/users/${id}/disable`, { method: "PATCH" });

export const enableUser = (id: string) =>
  apiFetch<AdminUser>(`/admin/users/${id}/enable`, { method: "PATCH" });

export const deleteUser = (id: string) =>
  apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" });

export interface AdminStats {
  users: { total: number; active: number; disabled: number; new_this_week: number };
  resumes: { base_resumes: number; variants: number };
  jobs: { total_tracked: number; applications: number };
  ai: {
    tailor_runs_total: number;
    tailor_runs_this_month: number;
    estimated_cost_total_usd: number;
    estimated_cost_this_month_usd: number;
  };
  content: { ats_scores: number; cover_letters: number; skill_gaps: number };
  growth: { week: string; users: number }[];
  daily_activity: { date: string; tailor_runs: number; ats_scores: number }[];
}

export const getAdminStats = () => apiFetch<AdminStats>("/admin/stats");

export interface AiFeatureStat {
  feature: string;
  calls: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_hit_rate: number;
}

export interface AiTopUser {
  user_id: string;
  email: string;
  display_name: string;
  calls: number;
  cost_usd: number;
}

export interface AiDailyTrend {
  date: string;
  calls: number;
  cost_usd: number;
  tokens: number;
  cache_hits: number;
}

export interface AiUsageStats {
  this_month: {
    calls: number;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_hit_rate: number;
    cache_hits: number;
  };
  per_feature: AiFeatureStat[];
  top_users: AiTopUser[];
  daily_trend: AiDailyTrend[];
}

export const getAiUsageStats = () => apiFetch<AiUsageStats>("/admin/stats/ai-usage");
