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

export const submitVariantScore = (resume_variant_id: string, jd_text?: string) => {
  const params = new URLSearchParams({ resume_variant_id });
  if (jd_text) params.set("jd_text", jd_text);
  return apiFetch<AtsScore | AsyncScoreResponse>(`/ats/score/variant?${params}`, { method: "POST" });
};

export const getScore = (id: string) => apiFetch<AtsScore>(`/ats/scores/${id}`);
export const listScores = () => apiFetch<AtsScore[]>("/ats/scores");

/** Fetch the latest stored complete ATS score for a specific variant (null if none). */
export const getVariantStoredScore = async (variantId: string): Promise<AtsScore | null> => {
  const results = await apiFetch<AtsScore[]>(`/ats/scores?resume_variant_id=${variantId}`);
  return results.length > 0 ? results[0] : null;
};
