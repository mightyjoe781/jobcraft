import { apiFetch } from "./client";

export interface DashboardStats {
  // Score analytics
  score_trend: { score: number; company: string; date: string }[];
  breakdown_avg: Record<string, number>;
  top_missing_keywords: { term: string; count: number }[];
  most_demanded_skills: { skill: string; count: number; pct: number }[];
  total_scores: number;
  // Application analytics
  funnel: { stage: string; count: number }[];
  response_rate: number | null;
  weekly_velocity: { week: string; count: number }[];
  applications_by_status: Record<string, number>;
  // Counts
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
    label: string | null;
    created_at: string;
  }[];
  // Legacy
  avg_ats_score: number | null;
  ats_history: { score: number; date: string }[];
  upcoming_followups: unknown[];
}

export const getDashboardStats = () => apiFetch<DashboardStats>("/dashboard/stats");
