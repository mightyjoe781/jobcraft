import { getAccessToken } from "./client";
import { apiFetch } from "./client";

export type CoverLetterTone = "formal" | "conversational" | "enthusiastic";

export interface CoverLetter {
  id: string;
  job_id: string;
  resume_variant_id: string | null;
  body_text: string;
  tone: CoverLetterTone;
  created_at: string;
  updated_at: string;
  company: string | null;
  role_title: string | null;
}

export const listCoverLetters = () => apiFetch<CoverLetter[]>("/cover-letters");
export const getCoverLetter = (id: string) => apiFetch<CoverLetter>(`/cover-letters/${id}`);
export const updateCoverLetter = (id: string, body_text: string) =>
  apiFetch<CoverLetter>(`/cover-letters/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ body_text }),
  });
export const deleteCoverLetter = (id: string) =>
  apiFetch<void>(`/cover-letters/${id}`, { method: "DELETE" });

export const coverLetterPdfPath = (id: string) => `/api/cover-letters/${id}/pdf`;

/**
 * Stream-generate a cover letter. Returns an EventSource-like async iterator.
 * Calls the callback for each event: { type, data }.
 */
export async function* streamGenerate(body: {
  job_id: string;
  resume_variant_id?: string;
  tone: CoverLetterTone;
  personal_hook?: string;
}): AsyncGenerator<{ type: string; data: Record<string, string> }> {
  const token = getAccessToken();
  const res = await fetch("/api/cover-letters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Generate failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split("\n");
      let type = "message";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) type = line.slice(7);
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (dataStr) {
        try {
          yield { type, data: JSON.parse(dataStr) };
        } catch {
          // skip malformed
        }
      }
    }
  }
}
