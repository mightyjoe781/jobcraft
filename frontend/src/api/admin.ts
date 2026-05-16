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
