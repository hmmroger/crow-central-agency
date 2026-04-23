import { useCallback, useEffect, useRef, useState } from "react";
import { MCP_CONFIG_TYPE, type McpConfigType, type McpServerConfig } from "@crow-central-agency/shared";
import type { KeyValuePair, McpConfigEditorFormState } from "./mcp-config-editor.types.js";

/** Default form state for a new MCP config */
const DEFAULT_FORM_STATE: McpConfigEditorFormState = {
  name: "",
  description: "",
  type: MCP_CONFIG_TYPE.STDIO,
  isDisabled: false,
  enableForCrow: false,
  command: "",
  args: [],
  env: [],
  url: "",
  headers: [],
};

/** Convert a Record<string, string> to KeyValuePair array */
function recordToPairs(record?: Record<string, string>): KeyValuePair[] {
  if (!record) {
    return [];
  }

  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

/** Build form state from an existing MCP config */
function formStateFromConfig(config: McpServerConfig): McpConfigEditorFormState {
  const base = {
    name: config.name,
    description: config.description ?? "",
    type: config.type,
    isDisabled: config.isDisabled ?? false,
    enableForCrow: config.enableForCrow ?? false,
  };

  if (config.type === MCP_CONFIG_TYPE.STDIO) {
    return {
      ...DEFAULT_FORM_STATE,
      ...base,
      command: config.command,
      args: config.args ?? [],
      env: recordToPairs(config.env),
    };
  }

  return {
    ...DEFAULT_FORM_STATE,
    ...base,
    url: config.url,
    headers: recordToPairs(config.headers),
  };
}

/** Deep equality check for KeyValuePair arrays */
function pairsEqual(pairsA: KeyValuePair[], pairsB: KeyValuePair[]): boolean {
  if (pairsA.length !== pairsB.length) {
    return false;
  }

  return pairsA.every((pair, index) => pair.key === pairsB[index].key && pair.value === pairsB[index].value);
}

/** Deep equality check for string arrays */
function stringArraysEqual(arrayA: string[], arrayB: string[]): boolean {
  if (arrayA.length !== arrayB.length) {
    return false;
  }

  return arrayA.every((item, index) => item === arrayB[index]);
}

/** Deep equality check for form state */
function isFormEqual(formA: McpConfigEditorFormState, formB: McpConfigEditorFormState): boolean {
  return (
    formA.name === formB.name &&
    formA.description === formB.description &&
    formA.type === formB.type &&
    formA.isDisabled === formB.isDisabled &&
    formA.enableForCrow === formB.enableForCrow &&
    formA.command === formB.command &&
    formA.url === formB.url &&
    stringArraysEqual(formA.args, formB.args) &&
    pairsEqual(formA.env, formB.env) &&
    pairsEqual(formA.headers, formB.headers)
  );
}

/**
 * Encapsulates MCP config editor form state with dirty tracking.
 * Name setter enforces alphanumeric + spaces constraint.
 * Type setter clears type-specific fields on type change.
 *
 * @param config - Existing config data (undefined for create mode)
 */
export function useMcpConfigEditorForm(config?: McpServerConfig) {
  const [form, setForm] = useState<McpConfigEditorFormState>(DEFAULT_FORM_STATE);
  const initialSnapshot = useRef<McpConfigEditorFormState>(DEFAULT_FORM_STATE);

  // Populate form when config data arrives
  useEffect(() => {
    if (!config) {
      return;
    }

    const loaded = formStateFromConfig(config);
    setForm(loaded);
    initialSnapshot.current = loaded;
  }, [config]);

  const isDirty = !isFormEqual(form, initialSnapshot.current);

  // --- Scalar field setters ---

  /** Set name with alphanumeric + spaces constraint */
  const setName = useCallback(
    (value: string) => setForm((prev) => ({ ...prev, name: value.replace(/[^a-zA-Z0-9 ]/g, "") })),
    []
  );

  const setDescription = useCallback((value: string) => setForm((prev) => ({ ...prev, description: value })), []);

  const setIsDisabled = useCallback((value: boolean) => setForm((prev) => ({ ...prev, isDisabled: value })), []);

  const setEnableForCrow = useCallback((value: boolean) => setForm((prev) => ({ ...prev, enableForCrow: value })), []);

  const setCommand = useCallback((value: string) => setForm((prev) => ({ ...prev, command: value })), []);

  const setUrl = useCallback((value: string) => setForm((prev) => ({ ...prev, url: value })), []);

  /** Set type — clears type-specific fields when switching */
  const setType = useCallback(
    (value: McpConfigType) =>
      setForm((prev) => {
        if (prev.type === value) {
          return prev;
        }

        return {
          ...prev,
          type: value,
          // Clear type-specific fields
          command: "",
          args: [],
          env: [],
          url: "",
          headers: [],
        };
      }),
    []
  );

  // --- Args (string[]) helpers ---

  const addArg = useCallback(() => setForm((prev) => ({ ...prev, args: [...prev.args, ""] })), []);

  const updateArg = useCallback(
    (index: number, value: string) =>
      setForm((prev) => ({ ...prev, args: prev.args.map((arg, idx) => (idx === index ? value : arg)) })),
    []
  );

  const removeArg = useCallback(
    (index: number) => setForm((prev) => ({ ...prev, args: prev.args.filter((_, idx) => idx !== index) })),
    []
  );

  // --- Env (KeyValuePair[]) helpers ---

  const addEnvPair = useCallback(
    () => setForm((prev) => ({ ...prev, env: [...prev.env, { key: "", value: "" }] })),
    []
  );

  const updateEnvPair = useCallback(
    (index: number, key: string, value: string) =>
      setForm((prev) => ({
        ...prev,
        env: prev.env.map((pair, idx) => (idx === index ? { key, value } : pair)),
      })),
    []
  );

  const removeEnvPair = useCallback(
    (index: number) => setForm((prev) => ({ ...prev, env: prev.env.filter((_, idx) => idx !== index) })),
    []
  );

  // --- Headers (KeyValuePair[]) helpers ---

  const addHeaderPair = useCallback(
    () => setForm((prev) => ({ ...prev, headers: [...prev.headers, { key: "", value: "" }] })),
    []
  );

  const updateHeaderPair = useCallback(
    (index: number, key: string, value: string) =>
      setForm((prev) => ({
        ...prev,
        headers: prev.headers.map((pair, idx) => (idx === index ? { key, value } : pair)),
      })),
    []
  );

  const removeHeaderPair = useCallback(
    (index: number) => setForm((prev) => ({ ...prev, headers: prev.headers.filter((_, idx) => idx !== index) })),
    []
  );

  return {
    form,
    isDirty,
    setName,
    setDescription,
    setType,
    setIsDisabled,
    setEnableForCrow,
    setCommand,
    setUrl,
    addArg,
    updateArg,
    removeArg,
    addEnvPair,
    updateEnvPair,
    removeEnvPair,
    addHeaderPair,
    updateHeaderPair,
    removeHeaderPair,
  };
}
