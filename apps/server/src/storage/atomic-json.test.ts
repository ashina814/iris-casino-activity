import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonFile, readJsonFileSync, writeJsonFile, type JsonStateValidator } from "./atomic-json.js";

const versioned: JsonStateValidator<{ version: number }> = (value): value is { version: number } => Boolean(value && typeof value === "object" && typeof (value as { version?: unknown }).version === "number");
const casinoRounds: JsonStateValidator<Array<{ roundId: string; discordUserId: string; phase: string }>> = (value): value is Array<{ roundId: string; discordUserId: string; phase: string }> => Array.isArray(value) && value.every((round) => Boolean(round && typeof round === "object" && typeof (round as Record<string, unknown>).roundId === "string" && typeof (round as Record<string, unknown>).discordUserId === "string" && typeof (round as Record<string, unknown>).phase === "string"));

describe("atomic JSON storage", () => {
  it("writes atomically and recovers a syntactically corrupt primary file from one backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "state.json");
    try {
      writeJsonFile(filePath, { version: 1 }, undefined, versioned);
      writeJsonFile(filePath, { version: 2 }, undefined, versioned);
      await writeFile(filePath, "{broken", "utf8");
      expect(JSON.parse(readJsonFileSync(filePath, "utf8", versioned))).toEqual({ version: 1 });
      expect(readJsonFile(filePath, { version: 0 }, versioned)).toEqual({ version: 1 });
      expect(await readFile(`${filePath}.bak`, "utf8")).toContain('"version":1');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not replace a valid backup with a corrupt primary during the next save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "state.json");
    try {
      writeJsonFile(filePath, { version: 1 }, undefined, versioned);
      writeJsonFile(filePath, { version: 2 }, undefined, versioned);
      await writeFile(filePath, "{broken", "utf8");

      writeJsonFile(filePath, { version: 3 }, undefined, versioned);

      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ version: 3 });
      expect(JSON.parse(await readFile(`${filePath}.bak`, "utf8"))).toEqual({ version: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers a missing primary from a validated backup and fails closed for an invalid backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "rounds.json");
    const valid = [{ roundId: "round-1", discordUserId: "user-1", phase: "active" }];
    try {
      await writeFile(`${filePath}.bak`, JSON.stringify(valid), "utf8");
      expect(readJsonFile(filePath, [], casinoRounds)).toEqual(valid);
      expect(JSON.parse(readJsonFileSync(filePath, "utf8", casinoRounds))).toEqual(valid);

      await writeFile(`${filePath}.bak`, JSON.stringify({ rounds: valid }), "utf8");
      expect(() => readJsonFile(filePath, [], casinoRounds)).toThrow("invalid shape");
      expect(() => readJsonFileSync(filePath, "utf8", casinoRounds)).toThrow("invalid shape");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses fallback only when both primary and backup are absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    try {
      expect(readJsonFile(join(directory, "new.json"), [], casinoRounds)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers from shape-invalid primaries without replacing a valid backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "rounds.json");
    const valid = [{ roundId: "round-1", discordUserId: "user-1", phase: "active" }];
    try {
      await writeFile(filePath, JSON.stringify({ rounds: valid }), "utf8");
      await writeFile(`${filePath}.bak`, JSON.stringify(valid), "utf8");
      expect(readJsonFile(filePath, [], casinoRounds)).toEqual(valid);

      await writeFile(filePath, JSON.stringify([{ roundId: "round-2", discordUserId: "user-2" }]), "utf8");
      writeJsonFile(filePath, valid, undefined, casinoRounds);
      expect(JSON.parse(await readFile(`${filePath}.bak`, "utf8"))).toEqual(valid);

      await writeFile(filePath, JSON.stringify({ rounds: valid }), "utf8");
      await writeFile(`${filePath}.bak`, JSON.stringify({ rounds: valid }), "utf8");
      expect(() => readJsonFile(filePath, [], casinoRounds)).toThrow("invalid shape");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
