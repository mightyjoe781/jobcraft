import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../api/client";

/**
 * Fetches a PDF from an authenticated API endpoint and returns a blob objectURL.
 * The URL is revoked automatically when the component unmounts or apiUrl changes.
 *
 * @param apiPath  e.g. "/api/resumes/base/{id}/pdf" — null to skip fetching
 * @returns { objectUrl, loading, error }
 */
export function usePdfBlob(apiPath: string | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!apiPath) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const token = getAccessToken();
    fetch(apiPath, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = url;
        setObjectUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  // Revoke on unmount
  useEffect(() => {
    return () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, []);

  return { objectUrl, loading, error };
}
