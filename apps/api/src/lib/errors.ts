export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do that') =>
  new ApiError(403, 'forbidden', message);
export const unauthorized = () => new ApiError(401, 'unauthorized', 'Sign in required');
export const conflict = (message: string) => new ApiError(409, 'conflict', message);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'bad_request', message, details);
