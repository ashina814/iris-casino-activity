import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors.js";
import { createRateLimit } from "./rate-limit.js";

describe("createRateLimit", () => {
  it("returns a rate_limited error after the configured request ceiling", () => {
    const middleware = createRateLimit({ max: 2, windowMs: 60_000, key: (req) => req.ip || "unknown" });
    const headers = new Map<string, string>();
    const response = { setHeader: vi.fn((name: string, value: string) => headers.set(name, value)) } as unknown as Response;
    const request = { ip: "127.0.0.1" } as Request;
    const next = vi.fn();

    middleware(request, response, next);
    middleware(request, response, next);
    middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls[2]?.[0]).toBeInstanceOf(AppError);
    expect((next.mock.calls[2]?.[0] as AppError).code).toBe("rate_limited");
    expect(headers.get("RateLimit-Remaining")).toBe("0");
    expect(headers.get("Retry-After")).toBeDefined();
  });
});
