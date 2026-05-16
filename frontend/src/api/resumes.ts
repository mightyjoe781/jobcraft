import { apiFetch } from "./client";

export interface Template {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  is_ats_friendly: boolean;
  sort_order: number;
  thumbnail_pdf_path: string | null;
}

export interface BaseResume {
  id: string;
  label: string;
  source_type: string;
  source_template_id: string | null;
  source_variant_id: string | null;
  pdf_cache_path: string | null;
  created_at: string;
  updated_at: string;
  variant_count: number;
}

export interface BaseResumeWithTex extends BaseResume {
  tex_source: string;
}

export interface Snapshot {
  id: string;
  saved_at: string;
}

export interface SnapshotWithTex extends Snapshot {
  tex_source: string;
}

export interface Variant {
  id: string;
  base_resume_id: string;
  job_id: string | null;
  modified_tex_path: string;
  pdf_path: string | null;
  ats_score: number | null;
  label: string | null;
  created_at: string;
  company: string | null;
  role_title: string | null;
}

export interface DiffOut {
  original_tex: string;
  modified_tex: string;
}

// Templates
export const listTemplates = () => apiFetch<Template[]>("/templates");
export const getTemplateTex = (id: string) =>
  apiFetch<{ tex_source: string }>(`/templates/${id}/tex`);
export const templatePdfUrl = (id: string) => `/api/templates/${id}/pdf`;

// Base resumes
export const listBaseResumes = () => apiFetch<BaseResume[]>("/resumes/base");
export const getBaseResume = (id: string) =>
  apiFetch<BaseResumeWithTex>(`/resumes/base/${id}`);
export const createBaseResume = (body: {
  label: string;
  source_type: string;
  source_template_id?: string;
  source_variant_id?: string;
  tex_source: string;
}) => apiFetch<BaseResume>("/resumes/base", { method: "POST", body: JSON.stringify(body) });
export const updateBaseResume = (id: string, body: { label?: string; tex_source?: string }) =>
  apiFetch<BaseResume>(`/resumes/base/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteBaseResume = (id: string) =>
  apiFetch<void>(`/resumes/base/${id}`, { method: "DELETE" });
export const renderBaseResume = (id: string) =>
  apiFetch<{ pdf_path: string }>(`/resumes/base/${id}/render`, { method: "POST" });
export const baseResumePdfUrl = (id: string) => `/api/resumes/base/${id}/pdf`;

// Snapshots
export const listSnapshots = (resumeId: string) =>
  apiFetch<Snapshot[]>(`/resumes/base/${resumeId}/snapshots`);
export const createSnapshot = (resumeId: string) =>
  apiFetch<Snapshot>(`/resumes/base/${resumeId}/snapshots`, { method: "POST" });
export const getSnapshot = (resumeId: string, snapId: string) =>
  apiFetch<SnapshotWithTex>(`/resumes/base/${resumeId}/snapshots/${snapId}`);

// AI Fill
export const aiFill = (resumeId: string, background_text: string) =>
  apiFetch<{ filled_tex: string }>(`/resumes/base/${resumeId}/ai-fill`, {
    method: "POST",
    body: JSON.stringify({ background_text }),
  });

// Variants
export const listVariants = (job_id?: string) =>
  apiFetch<Variant[]>(`/resumes/variants${job_id ? `?job_id=${job_id}` : ""}`);
export const getVariant = (id: string) => apiFetch<Variant>(`/resumes/variants/${id}`);
export const getVariantDiff = (id: string) => apiFetch<DiffOut>(`/resumes/variants/${id}/diff`);
export const deleteVariant = (id: string) =>
  apiFetch<void>(`/resumes/variants/${id}`, { method: "DELETE" });
export const variantPdfUrl = (id: string) => `/api/resumes/variants/${id}/pdf`;
