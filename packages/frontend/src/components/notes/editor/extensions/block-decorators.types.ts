/** A drawn part of the viewport; decorators that span many lines only decorate the lines inside it */
export interface VisibleRange {
  from: number;
  to: number;
}
