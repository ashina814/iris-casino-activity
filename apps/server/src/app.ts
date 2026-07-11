import type { DiscordUser } from "@iris/shared";
import { AuthExchangeRequestSchema } from "@iris/shared";
import cookieSession from "cookie-session";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request } from "express";
import helmet from "helmet";
import { exchangeDiscordCode, mockDiscordUser } from "./auth/discord.js";
import { loadEnv, type ServerEnv } from "./env.js";
import { AppError, asyncRoute, sendError } from "./errors.js";
import { getWalletForDiscordUser } from "./services/wallet.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface AppLogger {
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface CreateAppOptions {
  env?: Record<string, unknown>;
  fetch?: FetchLike;
  logger?: AppLogger;
}

type IrisSession = CookieSessionInterfaces.CookieSessionObject & {
  user?: DiscordUser;
};

export function createApp(options: CreateAppOptions = {}) {
  const env = loadEnv(options.env);
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const logger = options.logger ?? console;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origin === env.WEB_ORIGIN) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, "forbidden_origin", "Origin is not allowed."));
      }
    })
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    cookieSession({
      name: "iris_session",
      keys: [sessionSecret(env)],
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "iris-casino-activity",
      version: "0.1.0"
    });
  });

  app.post(
    "/api/auth/exchange",
    asyncRoute(async (req, res) => {
      const parsed = AuthExchangeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "bad_request", "Request body is invalid.");
      }

      const user = env.IRIS_MOCK_AUTH
        ? mockDiscordUser
        : await exchangeDiscordCode(parsed.data.code, env, fetchFn);

      getSession(req).user = user;
      res.json({ ok: true, user });
    })
  );

  app.get("/api/me", (req, res) => {
    const user = getSession(req).user;
    if (!user) {
      throw new AppError(401, "unauthorized", "Authentication is required.");
    }
    res.json({ ok: true, user });
  });

  app.get(
    "/api/wallet",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) {
        throw new AppError(401, "unauthorized", "Authentication is required.");
      }

      const wallet = await getWalletForDiscordUser(user.id, env, fetchFn);
      res.json({ ok: true, wallet: wallet.wallet, currency: wallet.currency });
    })
  );

  app.use((_req, _res, next) => {
    next(new AppError(404, "not_found", "Route was not found."));
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const appError = error instanceof AppError
      ? error
      : new AppError(500, "internal_error", "An internal error occurred.");
    logger.error("api_error", {
      code: appError.code,
      status: appError.status
    });
    sendError(res, appError);
  };
  app.use(errorHandler);

  return app;
}

function getSession(req: Request): IrisSession {
  return req.session as IrisSession;
}

function sessionSecret(env: ServerEnv): string {
  return env.SESSION_SECRET || "dev-only-session-secret-change-me";
}
