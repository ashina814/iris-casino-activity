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

export const CasinoIdentifierSchema = z.string().regex(/^[A-Za-z0-9:_.-]+$/).min(1).max(128);

export const CasinoGameSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(64);

export const CasinoReservationRequestSchema = z.object({
  transactionId: CasinoIdentifierSchema,
  discordUserId: z.string().regex(/^\d{17,20}$/),
  sessionId: CasinoIdentifierSchema,
  game: CasinoGameSchema,
  bet: z.number().int().positive().safe()
});

export type CasinoReservationRequest = z.infer<typeof CasinoReservationRequestSchema>;

export const CasinoSettlementRequestSchema = z.object({
  payout: z.number().int().nonnegative().safe()
});

export type CasinoSettlementRequest = z.infer<typeof CasinoSettlementRequestSchema>;

export const CasinoTransactionSchema = z.object({
  transactionId: CasinoIdentifierSchema,
  sessionId: CasinoIdentifierSchema,
  game: CasinoGameSchema,
  bet: z.number().int().positive(),
  status: z.enum(["reserved", "settled", "cancelled"]),
  payout: z.number().int().nonnegative().nullable()
});

export type CasinoTransaction = z.infer<typeof CasinoTransactionSchema>;

export const CasinoTransactionResponseSchema = z.object({
  ok: z.literal(true),
  currency: z.literal("Ris"),
  transaction: CasinoTransactionSchema
});

export type CasinoTransactionResponse = z.infer<typeof CasinoTransactionResponseSchema>;

export const CasinoMutationResponseSchema = z.object({
  ok: z.literal(true),
  wallet: z.number().int().nonnegative(),
  currency: z.literal("Ris"),
  transaction: CasinoTransactionSchema
});

export type CasinoMutationResponse = z.infer<typeof CasinoMutationResponseSchema>;

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
  "insufficient_funds",
  "bet_out_of_range",
  "payout_out_of_range",
  "rate_limited",
  "casino_transaction_conflict",
  "casino_transaction_not_found",
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
