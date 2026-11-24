import { useCallback, useEffect, useRef, useState } from "react";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { hasCommandModifier } from "../../../utils/platform-utils.js";
import type { FindResult, FindSurfaceHandle } from "./find.types.js";

const FIND_KEY = "f";

/**
 * The host side of find: the bar's open state, query, match case and last result, and Ctrl/⌘+F.
 * The shortcut is taken only while `isEnabled` and no dialog is open, so the browser's find runs otherwise.
 * The bar shows only while enabled; its query and open state outlast a surface switch.
 */
export function useFind(isEnabled: boolean) {
  const { openDialogIds } = useModalDialog();
  const surfaceRef = useRef<FindSurfaceHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [result, setResult] = useState<FindResult>();
  const [focusRequest, setFocusRequest] = useState(0);
  const isActive = isOpen && isEnabled;

  useEffect(() => {
    if (isActive) {
      surfaceRef.current?.setQuery({ text: query, isCaseSensitive });
    } else {
      surfaceRef.current?.clear();
      setResult(undefined);
    }
  }, [isActive, query, isCaseSensitive]);

  useEffect(() => {
    if (focusRequest > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusRequest]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFindKey =
        hasCommandModifier(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === FIND_KEY;
      if (!isFindKey || !isEnabled || openDialogIds.length > 0) {
        return;
      }

      event.preventDefault();
      if (event.repeat) {
        return;
      }

      if (!isOpen) {
        const selectionQuery = surfaceRef.current?.getSelectionQuery();
        if (selectionQuery) {
          setQuery(selectionQuery);
        }

        setIsOpen(true);
      }

      setFocusRequest((request) => request + 1);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, isOpen, openDialogIds]);

  const next = useCallback(() => surfaceRef.current?.next(), []);
  const previous = useCallback(() => surfaceRef.current?.previous(), []);
  const toggleCaseSensitive = useCallback(() => setIsCaseSensitive((value) => !value), []);

  const close = useCallback(() => {
    setIsOpen(false);
    surfaceRef.current?.focus();
  }, []);

  return {
    surfaceRef,
    inputRef,
    isOpen: isActive,
    query,
    isCaseSensitive,
    result,
    setQuery,
    toggleCaseSensitive,
    next,
    previous,
    close,
    onResult: setResult,
  };
}
