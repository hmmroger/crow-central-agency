import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import { assertWithinBase, expandPath, readTextFile, resolveRealPath, statFile } from "../../utils/fs-utils.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, processTextContent, textToolResult } from "../tool-utils.js";
import {
  DEFAULT_INSPECT_JSON_DEPTH,
  DEFAULT_INSPECT_JSON_LINES,
  getInspectJsonAllowedBases,
  MAX_INSPECT_JSON_FILE_BYTES,
} from "./inspect-json.constants.js";
import type { JsonValue } from "./inspect-json.types.js";
import { renderJsonOutline } from "./json-outline.js";
import { selectJsonNode } from "./json-path.js";

interface JsonSource {
  label: string;
  text: string;
}

export const INSPECT_JSON_TOOL_NAME = "inspect_json";

const INSPECT_JSON_HEADER = "--- INSPECT JSON ---";
const INLINE_SOURCE_LABEL = "inline json";
const ROOT_PATH_LABEL = "(root)";
const ROOT_MATCH_LABEL = "the document root";

const resolveRequestedPath = (filePath: string, agentWorkspace: string): string =>
  path.isAbsolute(filePath) || filePath.startsWith("~") ? expandPath(filePath) : path.resolve(agentWorkspace, filePath);

const isWithinBase = (targetPath: string, base: string): boolean => {
  try {
    assertWithinBase(targetPath, base);
    return true;
  } catch {
    return false;
  }
};

/** Workspace allow outranks the state-directory deny, which outranks the temp-directory allow. */
const assertReadableJsonPath = async (filePath: string, realPath: string, agentWorkspace: string): Promise<void> => {
  if (isWithinBase(realPath, await resolveRealPath(agentWorkspace))) {
    return;
  }

  if (isWithinBase(realPath, await resolveRealPath(env.CROW_SYSTEM_PATH))) {
    throw new Error(
      `File path "${filePath}" resolves to "${realPath}", which is inside the platform state directory "${env.CROW_SYSTEM_PATH}" and is never readable through this tool.`
    );
  }

  const allowedBases = getInspectJsonAllowedBases(agentWorkspace);
  const realAllowedBases = await Promise.all(allowedBases.map(resolveRealPath));
  if (!realAllowedBases.some((base) => isWithinBase(realPath, base))) {
    throw new Error(
      `File path "${filePath}" resolves to "${realPath}", which is outside the directories this tool may read (${allowedBases.join(", ")}). Read the file with your own file tool and pass its text as "json" instead.`
    );
  }
};

const readJsonSourceText = async (filePath: string, agentWorkspace: string): Promise<string> => {
  const realPath = await resolveRealPath(resolveRequestedPath(filePath, agentWorkspace));
  await assertReadableJsonPath(filePath, realPath, agentWorkspace);

  const stats = await statFile(realPath);
  if (!stats.isFile()) {
    throw new Error(`File path "${filePath}" resolves to "${realPath}", which is not a file.`);
  }

  if (stats.size > MAX_INSPECT_JSON_FILE_BYTES) {
    throw new Error(
      `File "${filePath}" is ${stats.size} bytes, over the ${MAX_INSPECT_JSON_FILE_BYTES} byte limit. Extract the part you need first, or pass a smaller excerpt as "json".`
    );
  }

  return readTextFile(realPath);
};

const parseJsonDocument = (jsonText: string): JsonValue => {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
};

const buildInspectJsonHeader = (source: JsonSource, nodePath: string, depth: number): string[] => [
  INSPECT_JSON_HEADER,
  `[Source: ${source.label} | Path: ${nodePath || ROOT_PATH_LABEL} | Depth: ${depth}]`,
  `[Paths are addressable: pass any path back as the "path" argument, without its trailing [] or {} marker.]`,
];

export function getInspectJsonToolConfig(agentId: string, registry: AgentRegistry) {
  const inputSchema = {
    filePath: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Path to a JSON file, absolute or relative to your workspace. Mutually exclusive with json. Readable locations are your workspace and the system temp directory."
      ),
    json: z.string().min(1).optional().describe("JSON text to inspect. Mutually exclusive with filePath."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Node to render, using a path printed by an earlier call (e.g. data.items[0] or data["odd key"]). Omit to render the whole document.'
      ),
    depth: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(`Container levels expanded below the selected node. Default ${DEFAULT_INSPECT_JSON_DEPTH}.`),
    startLine: z.number().int().min(1).optional().describe("Line number to start the page at (1-based)."),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(`Maximum number of lines to return. Default ${DEFAULT_INSPECT_JSON_LINES}.`),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({
    filePath,
    json,
    path: nodePath,
    depth,
    startLine,
    limit,
  }) => {
    try {
      if (filePath !== undefined && json !== undefined) {
        return textToolResult(['Error: provide exactly one of "filePath" or "json", not both.'], true);
      }

      let source: JsonSource;
      if (filePath !== undefined) {
        const agentWorkspace = registry.resolveWorkspace(registry.getAgent(agentId));
        source = { label: filePath, text: await readJsonSourceText(filePath, agentWorkspace) };
      } else if (json !== undefined) {
        source = { label: INLINE_SOURCE_LABEL, text: json };
      } else {
        return textToolResult(['Error: provide exactly one of "filePath" or "json".'], true);
      }

      const document = parseJsonDocument(source.text);
      const selection = selectJsonNode(document, nodePath ?? "");
      if (!selection.isFound) {
        return textToolResult(
          [
            `Error: path "${nodePath}" was not found. The deepest part that did resolve is ${selection.resolvedPath ? `"${selection.resolvedPath}"` : ROOT_MATCH_LABEL}, so correct the path from there.`,
          ],
          true
        );
      }

      const effectiveDepth = depth ?? DEFAULT_INSPECT_JSON_DEPTH;
      const lines = renderJsonOutline(selection.value, { depth: effectiveDepth, basePath: selection.path });
      const processed = processTextContent(lines.join("\n"), {
        showLineNumber: true,
        startLine,
        limit: limit ?? DEFAULT_INSPECT_JSON_LINES,
      });

      return textToolResult([
        ...buildInspectJsonHeader(source, selection.path, effectiveDepth),
        ...processed.headerParts,
        processed.text,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to inspect JSON.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: INSPECT_JSON_TOOL_NAME,
    description:
      "Inspect a JSON file or JSON text as a flattened outline of `path = value` lines, where every line is self-contained and carries its full path. Start without a path to map the document, then pass any printed path back as the path argument to expand that node. Use this instead of reading a large JSON file directly.",
    inputSchema,
    handler,
  };

  return config;
}
