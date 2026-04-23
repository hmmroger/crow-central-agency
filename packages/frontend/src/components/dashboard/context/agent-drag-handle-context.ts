import { createContext } from "react";
import type { AgentDragHandleContextValue } from "./agent-drag-handle-context.types.js";

/**
 * Bridges `SortableAgentCard`'s handle-scoped drag arming down to the grip
 * button inside `AgentCardHeader`. Undefined means the card is not inside a
 * sortable container (e.g. pinned section) — the grip renders nothing.
 */
export const AgentDragHandleContext = createContext<AgentDragHandleContextValue | undefined>(undefined);
