/** Time thresholds in milliseconds */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a timestamp as a relative time string (e.g. "2 min ago", "3 hours ago").
 * Falls back to locale date for timestamps older than 7 days.
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < MINUTE) {
    return "just now";
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);

    return `${minutes} min ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);

    return `${hours}h ago`;
  }

  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);

    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}

/** Extract a short domain label from a full URL; falls back to the raw URL on parse error. */
export function formatUrlDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Format file size for display */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatJSONString(value: unknown): string {
  try {
    return JSON.stringify(value, undefined, 2);
  } catch {
    return String(value);
  }
}
