import { z } from "zod";

export const DiscordUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().nullable()
});

export type DiscordUser = z.infer<typeof DiscordUserSchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("iris-casino-activity"),
  version: z.string().min(1)
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AuthExchangeRequestSchema = z.object({
  code: z.string().min(1).max(4096)
});

export type AuthExchangeRequest = z.infer<typeof AuthExchangeRequestSchema>;

export const MeResponseSchema = z.object({
  ok: z.literal(true),
  user: DiscordUserSchema
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

export const WalletResponseSchema = z.object({
  ok: z.literal(true),
  wallet: z.number().int().nonnegative(),
  currency: z.literal("Ris")
});

export type WalletResponse = z.infer<typeof WalletResponseSchema>;

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden_origin",
  "discord_auth_unconfigured",
  "discord_auth_failed",
  "user_not_registered",
  "economy_not_joined",
  "economy_unavailable",
  "economy_timeout",
  "invalid_economy_response",
  "internal_error",
  "not_found"
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1)
  })
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiResponseSchema = z.union([
  HealthResponseSchema,
  MeResponseSchema,
  WalletResponseSchema,
  ApiErrorSchema
]);

export type ApiResponse = z.infer<typeof ApiResponseSchema>;
