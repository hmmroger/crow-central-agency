import { HeaderPortal } from "../layout/header-portal.js";
import { FeedConfigSection } from "./feed-config-section.js";
import { McpConfigSection } from "./mcp-config-section.js";

/**
 * Settings view - top-level container for application configuration sections.
 */
export function SettingsView() {
  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Settings" />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-8">
          <FeedConfigSection />
          <McpConfigSection />
        </div>
      </div>
    </div>
  );
}
