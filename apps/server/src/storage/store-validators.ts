import type { JsonStateValidator } from "./atomic-json.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function roundArray(id: string, extra?: (round: JsonRecord) => boolean): JsonStateValidator {
  return (value): value is unknown => Array.isArray(value) && value.every((round) => isRecord(round)
    && typeof round[id] === "string"
    && typeof round.discordUserId === "string"
    && typeof round.phase === "string"
    && (extra?.(round) ?? true));
}

export const blackjackRounds = roundArray("id");
export const rouletteRounds = roundArray("spinId");
export const slotsState: JsonStateValidator = (value): value is unknown => isRecord(value)
  && Array.isArray(value.rounds) && rouletteRounds(value.rounds)
  && Array.isArray(value.players) && value.players.every((player) => isRecord(player) && typeof player.discordUserId === "string");
export const baccaratRounds = roundArray("roundId");
export const pokerRounds = roundArray("roundId");
export const sicBoRounds = roundArray("spinId");
export const kenoRounds = roundArray("drawId");
export const dragonRounds = roundArray("roundId");
export const wheelRounds = roundArray("spinId");
export const crapsRounds = roundArray("roundId");
export const plinkoRounds = roundArray("dropId");
export const hiLoRounds = roundArray("roundId");
export const minesRounds = roundArray("roundId");
export const warRounds = roundArray("roundId");
export const bingoRounds = roundArray("drawId");
export const scratchRounds = roundArray("ticketId");
export const legacyGameRounds = roundArray("id", (round) => typeof round.game === "string");
export const duelRounds: JsonStateValidator = (value): value is unknown => Array.isArray(value) && value.every((duel) => isRecord(duel)
  && typeof duel.id === "string"
  && typeof duel.room === "string"
  && typeof duel.status === "string"
  && Array.isArray(duel.players));
export const activityProgress: JsonStateValidator = (value): value is unknown => isRecord(value) && isRecord(value.users);
export const partyState: JsonStateValidator = (value): value is unknown => isRecord(value) && isRecord(value.rooms);
