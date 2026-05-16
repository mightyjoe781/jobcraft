import { apiFetch } from "./client";

export type AppStatus =
  | "saved" | "tailoring" | "applied" | "oa_screen"
  | "interview" | "offer" | "rejected" | "withdrawn";

export const STATUS_LABELS: Record<AppStatus, string> = {
  saved: "Saved",
  tailoring: "Tailoring",
  applied: "Applied",
  oa_screen: "OA / Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STATUS_ORDER: AppStatus[] = [
  "saved", "tailoring", "applied", "oa_screen",
  "interview", "offer", "rejected", "withdrawn",
];

export interface Application {
  id: string;
  job_id: string;
  company: string;
  role_title: string;
  jd_url: string | null;
  status: AppStatus;
  applied_at: string | null;
  referral_contact: string | null;
  notes: string | null;
  follow_up_date: string | null;
  ats_score: number | null;
  variant_id: string | null;
  variant_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationStats {
  total: number;
  by_status: Record<string, number>;
}

export const listApplications = () => apiFetch<Application[]>("/applications");
export const getApplication = (id: string) => apiFetch<Application>(`/applications/${id}`);
export const getStats = () => apiFetch<ApplicationStats>("/applications/stats");

export const createApplication = (job_id: string) =>
  apiFetch<Application>("/applications", {
    method: "POST",
    body: JSON.stringify({ job_id }),
  });

export const updateApplication = (
  id: string,
  data: Partial<{
    status: AppStatus;
    notes: string;
    referral_contact: string;
    follow_up_date: string;
    applied_at: string;
  }>
) =>
  apiFetch<Application>(`/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteApplication = (id: string) =>
  apiFetch<void>(`/applications/${id}`, { method: "DELETE" });
