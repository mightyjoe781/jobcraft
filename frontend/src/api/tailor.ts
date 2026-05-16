import { apiFetch } from "./client";

export interface Job {
  id: string;
  company: string;
  role_title: string;
  jd_text: string | null;
  jd_url: string | null;
  created_at: string;
}

export interface TailorResponse {
  variant_id: string;
  stream_url: string;
}

export const listJobs = () => apiFetch<Job[]>("/jobs");

export const createJob = (body: {
  company: string;
  role_title: string;
  jd_text?: string;
  jd_url?: string;
}) => apiFetch<Job>("/jobs", { method: "POST", body: JSON.stringify(body) });

export const fetchJd = (url: string) =>
  apiFetch<{ company: string; role_title: string; jd_text: string }>(
    "/jobs/fetch-jd",
    { method: "POST", body: JSON.stringify({ url }) }
  );

export const startTailoring = (body: {
  base_resume_id: string;
  job_id: string;
  aggressiveness: string;
  custom_instruction?: string;
}) => apiFetch<TailorResponse>("/tailor", { method: "POST", body: JSON.stringify(body) });
