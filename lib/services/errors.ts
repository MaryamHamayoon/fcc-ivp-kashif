/** Errors thrown by services; route handlers and server actions map them to HTTP status codes. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PolicyError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422, "invalid");
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
