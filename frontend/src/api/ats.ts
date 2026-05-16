import { apiFetch } from "./client";

export interface AtsBreakdown {
  keyword_match: number;
  semantic_relevance: number;
  formatting: number;
  action_verbs: number;
  quantification: number;
  seniority_match: number;
}

export interface MissingKeyword {
  term: string;
  priority: "high" | "medium" | "low";
  suggested_location: string;
}

export interface Suggestion {
  priority: number;
  category: string;
  suggestion: string;
  estimated_impact: string;
}

export interface AtsScore {
  id: string;
  status: "pending" | "complete" | "failed";
  overall_score: number | null;
  breakdown: AtsBreakdown | null;
  missing_keywords: MissingKeyword[] | null;
  suggestions: Suggestion[] | null;
  error_message: string | null;
  created_at: string;
}

export interface AsyncScoreResponse {
  score_id: string;
  status: "pending";
  poll_url: string;
}

export const submitScore = (body: {
  resume_variant_id?: string;
  job_id?: string;
  jd_text?: string;
}) =>
  apiFetch<AtsScore | AsyncScoreResponse>("/ats/score", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getScore = (id: string) => apiFetch<AtsScore>(`/ats/scores/${id}`);
export const listScores = () => apiFetch<AtsScore[]>("/ats/scores");
