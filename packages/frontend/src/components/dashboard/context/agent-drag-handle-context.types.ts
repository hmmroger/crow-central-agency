export interface AgentDragHandleContextValue {
  /** Called when the user presses the grip handle — arms the card for drag. */
  onMouseDown: () => void;
  /** Called when the user releases the grip handle — disarms the card. */
  onMouseUp: () => void;
}
