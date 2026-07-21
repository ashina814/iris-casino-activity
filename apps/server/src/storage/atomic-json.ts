import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function readJsonFile<T>(filePath: string, fallback: T, validate: (value: unknown) => value is T): T {
  try {
    return parse(filePath, validate);
  } catch (error) {
    if (isMissing(error)) return fallback;
    const backupPath = `${filePath}.bak`;
    try {
      const recovered = parse(backupPath, validate);
      console.warn("json_store_recovered_from_backup", { file: basename(filePath) });
      return recovered;
    } catch {
      throw error;
    }
  }
}

export function readJsonFileSync(filePath: string, _encoding: "utf8" = "utf8"): string {
  try {
    const content = readFileSync(filePath, "utf8");
    JSON.parse(content);
    return content;
  } catch (error) {
    if (isMissing(error)) throw error;
    try {
      const recovered = readFileSync(`${filePath}.bak`, "utf8");
      JSON.parse(recovered);
      console.warn("json_store_recovered_from_backup", { file: basename(filePath) });
      return recovered;
    } catch {
      throw error;
    }
  }
}

export function writeJsonFile(filePath: string, value: unknown, _encoding?: unknown): void {
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
    if (existsSync(filePath)) backupValidPrimary(filePath);
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function backupValidPrimary(filePath: string): void {
  const primary = readFileSync(filePath, "utf8");
  try {
    JSON.parse(primary);
  } catch {
    // Preserve the last known-good backup when the primary is already corrupt.
    return;
  }
  writeFileSync(`${filePath}.bak`, primary, { encoding: "utf8", mode: 0o600 });
}

function parse<T>(filePath: string, validate: (value: unknown) => value is T): T {
  const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!validate(value)) throw new Error(`JSON state has an invalid shape: ${basename(filePath)}`);
  return value;
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
