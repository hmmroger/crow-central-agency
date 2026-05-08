export class RequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly service?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "RequestError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
