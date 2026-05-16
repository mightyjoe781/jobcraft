import { apiFetch } from "./client";

export type GapStatus = "identified" | "learning" | "acquired" | "not_pursuing";
export type GapCategory = "hard_skill" | "tool" | "domain" | "seniority";

export interface SkillGap {
  id: string;
  job_id: string;
  category: GapCategory;
  skill_name: string;
  priority: number;
  why_it_matters: string;
  suggested_resource: string;
  status: GapStatus;
  created_at: string;
}

export const analyzeGaps = (job_id: string, base_resume_id: string) =>
  apiFetch<SkillGap[]>("/skill-gaps/analyze", {
    method: "POST",
    body: JSON.stringify({ job_id, base_resume_id }),
  });

export const listGaps = (job_id?: string) =>
  apiFetch<SkillGap[]>(`/skill-gaps${job_id ? `?job_id=${job_id}` : ""}`);

export const updateGapStatus = (id: string, status: GapStatus) =>
  apiFetch<SkillGap>(`/skill-gaps/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
