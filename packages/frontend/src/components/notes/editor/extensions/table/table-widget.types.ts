export const CARET_EDGE = {
  START: "start",
  END: "end",
} as const;

export type CaretEdge = (typeof CARET_EDGE)[keyof typeof CARET_EDGE];

export interface CaretPoint {
  x: number;
  y: number;
}

/** Where the caret goes in a cell: at `point` when it falls in the cell, else at `edge` */
export interface CaretPlacement {
  edge: CaretEdge;
  point?: CaretPoint;
}

/** A cell's text on either side of the caret, without the display-only final line break */
export interface TextAroundCaret {
  before: string;
  after: string;
}
