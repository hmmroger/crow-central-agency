export interface CaretPoint {
  x: number;
  y: number;
}

/** A cell's text on either side of the caret, without the display-only final line break */
export interface TextAroundCaret {
  before: string;
  after: string;
}
