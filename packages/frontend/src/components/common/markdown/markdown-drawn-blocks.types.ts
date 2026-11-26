export interface DrawnBlockKind {
  selector: string;
  /** The source a fresh placeholder of this kind is drawn from */
  readKey: (element: HTMLElement) => string;
}

export interface DrawnBlock {
  kind: DrawnBlockKind;
  key: string;
  element: HTMLElement;
}
