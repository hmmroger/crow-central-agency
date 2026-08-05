import { describe, expect, it } from "vitest";
import { MCP_CONFIG_TYPE, type CreateMcpConfigInput } from "@crow-central-agency/shared";
import { CrowMcpManager } from "./crow-mcp-manager.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { SystemSettingsManager } from "../services/system-settings-manager.js";
import { AgentRegistry } from "../services/agent-registry.js";
import { AgentCircleManager } from "../services/agent-circle-manager.js";
import { RelationshipManager } from "../services/relationship-manager.js";
import { FragmentManager } from "../services/fragment/fragment-manager.js";
import { WsBroadcaster } from "../services/ws-broadcaster.js";

function createManager(): CrowMcpManager {
  const store = new InMemoryObjectStore();
  const templateStore = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store);
  const circleManager = new AgentCircleManager(store, relationshipManager, broadcaster);
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager,
    broadcaster
  );
  const registry = new AgentRegistry(store, templateStore, broadcaster, circleManager, fragmentManager);
  const systemSettingsManager = new SystemSettingsManager(store);

  return new CrowMcpManager(store, systemSettingsManager, registry);
}

describe("CrowMcpManager.updateMcpConfig", () => {
  it("clears env when the update omits it (full replace, not merge)", async () => {
    const manager = createManager();
    const created = await manager.addMcpConfig({
      type: MCP_CONFIG_TYPE.STDIO,
      name: "local-server",
      command: "node",
      env: { API_KEY: "abc", REGION: "us" },
    });

    const update: CreateMcpConfigInput = {
      type: MCP_CONFIG_TYPE.STDIO,
      name: "local-server",
      command: "node",
    };
    const updated = await manager.updateMcpConfig(created.id, update);

    if (updated.type !== MCP_CONFIG_TYPE.STDIO) {
      throw new Error(`Expected stdio config, got ${updated.type}`);
    }

    expect(updated.env).toBeUndefined();
  });

  it("clears headers when the update omits them", async () => {
    const manager = createManager();
    const created = await manager.addMcpConfig({
      type: MCP_CONFIG_TYPE.HTTP,
      name: "remote-server",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token", "X-Env": "prod" },
    });

    const update: CreateMcpConfigInput = {
      type: MCP_CONFIG_TYPE.HTTP,
      name: "remote-server",
      url: "https://example.com/mcp",
    };
    const updated = await manager.updateMcpConfig(created.id, update);

    if (updated.type === MCP_CONFIG_TYPE.STDIO) {
      throw new Error(`Expected remote config, got ${updated.type}`);
    }

    expect(updated.headers).toBeUndefined();
  });

  it("clears args when the update omits them", async () => {
    const manager = createManager();
    const created = await manager.addMcpConfig({
      type: MCP_CONFIG_TYPE.STDIO,
      name: "local-server",
      command: "node",
      args: ["--flag", "value"],
    });

    const update: CreateMcpConfigInput = {
      type: MCP_CONFIG_TYPE.STDIO,
      name: "local-server",
      command: "node",
    };
    const updated = await manager.updateMcpConfig(created.id, update);

    if (updated.type !== MCP_CONFIG_TYPE.STDIO) {
      throw new Error(`Expected stdio config, got ${updated.type}`);
    }

    expect(updated.args).toBeUndefined();
  });
});
