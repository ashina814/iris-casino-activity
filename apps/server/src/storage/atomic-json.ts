import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type JsonStateValidator<T = unknown> = (value: unknown) => value is T;

export function readJsonFile<T>(filePath: string, fallback: T, validate: JsonStateValidator<T>): T {
  try {
    return parse(filePath, validate);
  } catch (primaryError) {
    const backupPath = `${filePath}.bak`;
    try {
      const recovered = parse(backupPath, validate);
      console.warn("json_store_recovered_from_backup", { file: basename(filePath) });
      return recovered;
    } catch (backupError) {
      if (isMissing(primaryError) && isMissing(backupError)) return fallback;
      throw isMissing(primaryError) ? backupError : primaryError;
    }
  }
}

export function readJsonFileSync(filePath: string, _encoding: "utf8" = "utf8", validate: JsonStateValidator = isStoredState): string {
  try {
    return readSerialized(filePath, validate);
  } catch (primaryError) {
    try {
      const recovered = readSerialized(`${filePath}.bak`, validate);
      console.warn("json_store_recovered_from_backup", { file: basename(filePath) });
      return recovered;
    } catch (backupError) {
      if (isMissing(primaryError) && isMissing(backupError)) throw primaryError;
      throw isMissing(primaryError) ? backupError : primaryError;
    }
  }
}

export function writeJsonFile(filePath: string, value: unknown, _encoding?: unknown, validate: JsonStateValidator = isStoredState): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  try {
    writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    const descriptor = openSync(temporaryPath, "r");
    try {
      try { fsyncSync(descriptor); } catch (error) {
        if (!isUnsupportedSync(error)) throw error;
      }
    } finally { closeSync(descriptor); }
    if (existsSync(filePath)) backupValidPrimary(filePath, validate);
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function backupValidPrimary(filePath: string, validate: JsonStateValidator): void {
  const primary = readFileSync(filePath, "utf8");
  try {
    const parsed: unknown = JSON.parse(primary);
    if (!validate(parsed)) return;
  } catch {
    // Preserve the last known-good backup when the primary is already corrupt.
    return;
  }
  writeFileSync(`${filePath}.bak`, primary, { encoding: "utf8", mode: 0o600 });
}

function parse<T>(filePath: string, validate: JsonStateValidator<T>): T {
  const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!validate(value)) throw new Error(`JSON state has an invalid shape: ${basename(filePath)}`);
  return value;
}

function readSerialized(filePath: string, validate: JsonStateValidator): string {
  const content = readFileSync(filePath, "utf8");
  const value: unknown = JSON.parse(content);
  if (!validate(value)) throw new Error(`JSON state has an invalid shape: ${basename(filePath)}`);
  return content;
}

function isStoredState(value: unknown): value is unknown {
  if (Array.isArray(value)) return value.every(isCasinoRoundOrDuel);
  if (!isRecord(value)) return false;
  if ("rounds" in value || "players" in value) {
    return Array.isArray(value.rounds)
      && value.rounds.every(isCasinoRound)
      && Array.isArray(value.players)
      && value.players.every((player) => isRecord(player) && typeof player.discordUserId === "string");
  }
  if ("users" in value) return isRecord(value.users);
  if ("rooms" in value) return isRecord(value.rooms);
  return false;
}

function isCasinoRoundOrDuel(value: unknown): boolean {
  return isCasinoRound(value)
    || (isRecord(value) && typeof value.id === "string" && typeof value.room === "string" && typeof value.status === "string" && Array.isArray(value.players));
}

function isCasinoRound(value: unknown): boolean {
  if (!isRecord(value) || typeof value.discordUserId !== "string" || typeof value.phase !== "string") return false;
  return ["id", "roundId", "spinId", "ticketId", "drawId", "dropId"].some((key) => typeof value[key] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isUnsupportedSync(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EINVAL" || error.code === "ENOTSUP");
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? "state";
}
