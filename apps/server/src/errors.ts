import type { ApiErrorCode } from "@iris/shared";
import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

type StagedError = Error & { casinoStage?: string; cause?: unknown };

export function annotateErrorStage(error: unknown, stage: string): Error {
  const staged: StagedError = error instanceof Error
    ? error as StagedError
    : new Error("A non-Error value was thrown.", { cause: error });
  staged.casinoStage ??= stage;
  return staged;
}

function redactErrorText(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(/([?&](?:access_?token|api_?key|authorization|cookie|password|secret|token)=)[^&\s]+/giu, "$1[REDACTED]")
    .replace(/(["']?(?:access_?token|api_?key|authorization|cookie|password|secret|token)["']?\s*[:=]\s*["']?)[^\s,"'}]+/giu, "$1[REDACTED]");
}

export function unexpectedErrorLogDetails(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) {
    return {
      errorName: "NonErrorThrown",
      errorMessage: "A non-Error value was thrown."
    };
  }

  const staged = error as StagedError;
  return {
    stage: staged.casinoStage,
    errorName: error.name,
    errorMessage: redactErrorText(error.message),
    errorStack: redactErrorText(error.stack),
    causeMessage: staged.cause instanceof Error ? redactErrorText(staged.cause.message) : undefined
  };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(500, "internal_error", "An internal error occurred.");
}

export function sendError(res: Response, error: unknown): void {
  const appError = toAppError(error);
  res.status(appError.status).json({
    ok: false,
    error: {
      code: appError.code,
      message: appError.message
    }
  });
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
