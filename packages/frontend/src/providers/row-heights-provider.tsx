import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ActivityItem } from "../components/agents/console/activity-item.js";
import { CommandItem } from "../components/agents/console/command-item.js";
import { ThinkingMessage } from "../components/agents/console/thinking-message.js";
import type { RowHeights } from "./row-heights-provider.types.js";

const PROBE_TOOL_NAME = "Read";
const PROBE_TOOL_CONTENT = "sample";
const PROBE_COMMAND_CONTENT = "/sample";
const PROBE_THINKING_CONTENT = "sample";

const INITIAL_ROW_HEIGHT_PX = 24;

const INITIAL_HEIGHTS: RowHeights = {
  toolUse: INITIAL_ROW_HEIGHT_PX,
  command: INITIAL_ROW_HEIGHT_PX,
  thinkingCollapsed: INITIAL_ROW_HEIGHT_PX,
};

const RowHeightsContext = createContext<RowHeights | undefined>(undefined);

export function RowHeightsProvider({ children }: { children: ReactNode }) {
  const [heights, setHeights] = useState<RowHeights>(INITIAL_HEIGHTS);
  const toolUseRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const toolUseEl = toolUseRef.current;
    const commandEl = commandRef.current;
    const thinkingEl = thinkingRef.current;

    if (!toolUseEl || !commandEl || !thinkingEl) {
      return;
    }

    setHeights({
      toolUse: Math.round(toolUseEl.getBoundingClientRect().height),
      command: Math.round(commandEl.getBoundingClientRect().height),
      thinkingCollapsed: Math.round(thinkingEl.getBoundingClientRect().height),
    });

    const observeProbe = (element: HTMLElement, key: keyof RowHeights) => {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        const height = Math.round(entry.contentRect.height);
        setHeights((prev) => (prev[key] === height ? prev : { ...prev, [key]: height }));
      });

      observer.observe(element);

      return observer;
    };

    const observers = [
      observeProbe(toolUseEl, "toolUse"),
      observeProbe(commandEl, "command"),
      observeProbe(thinkingEl, "thinkingCollapsed"),
    ];

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, []);

  return (
    <RowHeightsContext.Provider value={heights}>
      {children}
      <div aria-hidden className="absolute top-0 left-0 max-w-3xl invisible pointer-events-none">
        <div ref={toolUseRef}>
          <ActivityItem toolName={PROBE_TOOL_NAME} content={PROBE_TOOL_CONTENT} />
        </div>
        <div ref={commandRef}>
          <CommandItem content={PROBE_COMMAND_CONTENT} />
        </div>
        <div ref={thinkingRef}>
          <ThinkingMessage content={PROBE_THINKING_CONTENT} />
        </div>
      </div>
    </RowHeightsContext.Provider>
  );
}

export function useRowHeights(): RowHeights {
  const context = useContext(RowHeightsContext);

  if (!context) {
    throw new Error("useRowHeights must be used within a RowHeightsProvider");
  }

  return context;
}
