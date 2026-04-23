import { useCallback, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";

const VERIFY_URL = "/api/auth/verify";

/**
 * Full-screen access key entry page.
 * Shown when the user has no access key stored.
 * Verifies the key against the backend before storing it.
 */
export function AccessKeyPage() {
  const [inputValue, setInputValue] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }

    setIsVerifying(true);
    setErrorMessage(undefined);

    try {
      const response = await fetch(VERIFY_URL, {
        headers: { Authorization: `Bearer ${trimmed}` },
      });

      if (response.ok) {
        useAppStore.getState().setAccessKey(trimmed);
      } else {
        setErrorMessage("Invalid access key");
        inputRef.current?.focus();
      }
    } catch {
      setErrorMessage("Unable to connect to server");
    } finally {
      setIsVerifying(false);
    }
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-base">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-surface p-8 shadow-glow">
        <div className="flex flex-col items-center gap-2">
          <KeyRound className="h-8 w-8 text-primary" />
          <h1 className="font-sans text-lg font-semibold text-text-base">Crow Central Agency</h1>
          <p className="text-sm text-text-muted">Enter your access key to continue</p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="password"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Access key"
            disabled={isVerifying}
            autoFocus
            className="w-full rounded-md border border-border-subtle bg-surface-inset px-3 py-2 font-mono text-sm text-text-base placeholder:text-text-muted outline-none focus:border-border-focus disabled:opacity-50"
          />

          {errorMessage && <p className="text-xs text-error">{errorMessage}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isVerifying || !inputValue.trim()}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-primary/80 disabled:opacity-40"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Connect"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
