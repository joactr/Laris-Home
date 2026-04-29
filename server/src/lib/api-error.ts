import type { Response } from 'express';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'OFFLINE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'PROCESSING_FAILED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

export function fromZodError(details: unknown) {
  return new ApiError(400, 'VALIDATION_ERROR', 'La solicitud no es valida.', details);
}
