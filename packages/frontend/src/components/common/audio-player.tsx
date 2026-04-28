import { useCallback } from "react";
import { Download } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  filename?: string;
}

const DEFAULT_DOWNLOAD_NAME = "audio";

/**
 * Render an audio artifact with native HTML5 controls and a download button.
 * The blob URL lifecycle is owned by the parent (artifact-content-renderer).
 */
export function AudioPlayer({ src, filename }: AudioPlayerProps) {
  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = src;
    link.download = filename ?? DEFAULT_DOWNLOAD_NAME;
    link.click();
  }, [src, filename]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-end px-2 py-1 border-b border-border-subtle">
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
          onClick={handleDownload}
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <audio controls src={src} className="w-full max-w-md">
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  );
}
