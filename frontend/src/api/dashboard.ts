import { apiFetch } from "./client";

export interface DashboardStats {
  avg_ats_score: number | null;
  total_scores: number;
  ats_history: { score: number; date: string }[];
  top_missing_keywords: { term: string; count: number }[];
  total_variants: number;
  skill_gap_summary: {
    total: number;
    identified: number;
    learning: number;
    acquired: number;
    not_pursuing: number;
  };
  ai_usage: {
    tailor_runs_this_month: number;
    estimated_cost_usd: number;
  };
  recent_activity: {
    action: string;
    entity_type: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }[];
  applications_by_status: Record<string, number>;
  upcoming_followups: unknown[];
}

export const getDashboardStats = () => apiFetch<DashboardStats>("/dashboard/stats");
