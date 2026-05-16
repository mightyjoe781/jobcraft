import { apiFetch } from "./client";
import type { TokenResponse, User } from "../types";

export async function getAuthConfig(): Promise<{ registration_token_required: boolean }> {
  return apiFetch<{ registration_token_required: boolean }>("/auth/config");
}

export async function register(
  email: string,
  password: string,
  display_name: string,
  registration_token?: string,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name, registration_token: registration_token ?? "" }),
  });
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(refresh_token: string): Promise<void> {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}

export async function getMe(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

export async function updateMe(data: {
  display_name?: string;
  tailoring_preference?: string;
}): Promise<User> {
  return apiFetch<User>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteMe(): Promise<void> {
  return apiFetch<void>("/auth/me", { method: "DELETE" });
}
