export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export function badRequest(message: string): AppError {
  return new AppError(message, 400);
}

export function notFound(message: string): AppError {
  return new AppError(message, 404);
}

export function unauthorized(message = "Sign in required"): AppError {
  return new AppError(message, 401);
}

export function forbidden(message = "You do not have access to this workspace"): AppError {
  return new AppError(message, 403);
}
