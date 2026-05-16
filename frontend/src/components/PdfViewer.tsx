import { usePdfBlob } from "../hooks/usePdfBlob";

interface Props {
  apiPath: string | null;
  className?: string;
  title?: string;
}

/**
 * Authenticated PDF viewer — fetches via Bearer token and renders in an iframe.
 * Use this instead of <iframe src="/api/..."> anywhere a PDF needs auth.
 */
export function PdfViewer({ apiPath, className = "w-full h-full", title = "PDF" }: Props) {
  const { objectUrl, loading, error } = usePdfBlob(apiPath);

  if (!apiPath) return null;

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-950`}>
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-950`}>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!objectUrl) return null;

  // toolbar=0 + navpanes=0 → Chrome/Edge hide toolbar + sidebar
  // pagemode=none          → Firefox PDF.js: don't open sidebar on load
  // scrollbar=0            → Chrome: hide scrollbar chrome
  const src = `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0&pagemode=none`;

  // <embed> shows less browser chrome than <iframe> across engines
  return <embed src={src} type="application/pdf" className={className} title={title} />;
}

/**
 * Authenticated PDF download link — fetches the blob and triggers browser download.
 */
export function PdfDownloadLink({
  apiPath,
  filename,
  children,
  className,
}: {
  apiPath: string;
  filename: string;
  children: React.ReactNode;
  className?: string;
}) {
  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const { getAccessToken } = await import("../api/client");
    const token = getAccessToken();
    const res = await fetch(apiPath, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <a href={apiPath} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
