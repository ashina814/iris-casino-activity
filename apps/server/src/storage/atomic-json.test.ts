import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonFile, readJsonFileSync, writeJsonFile, type JsonStateValidator } from "./atomic-json.js";
import { activityProgress, duelRounds, legacyGameRounds, minesRounds, partyState, rouletteRounds } from "./store-validators.js";

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

  it("recovers each Store from a backup when the primary belongs to another Store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-store-shapes-"));
    const mines = [{ roundId: "mines-1", discordUserId: "user-1", phase: "active" }];
    const roulette = [{ spinId: "roulette-1", discordUserId: "user-1", phase: "settled" }];
    const duel = [{ id: "duel-1", room: "room-1", status: "active", players: [] }];
    try {
      const minesPath = join(directory, "mines.json");
      await writeFile(minesPath, JSON.stringify(duel));
      await writeFile(`${minesPath}.bak`, JSON.stringify(mines));
      expect(JSON.parse(readJsonFileSync(minesPath, "utf8", minesRounds))).toEqual(mines);

      const duelPath = join(directory, "duels.json");
      await writeFile(duelPath, JSON.stringify(roulette));
      await writeFile(`${duelPath}.bak`, JSON.stringify(duel));
      expect(JSON.parse(readJsonFileSync(duelPath, "utf8", duelRounds))).toEqual(duel);

      const legacyPath = join(directory, "legacy.json");
      await writeFile(legacyPath, JSON.stringify([{ id: "legacy-1", discordUserId: "user-1", phase: "active" }]));
      await writeFile(`${legacyPath}.bak`, JSON.stringify([{ id: "legacy-1", discordUserId: "user-1", phase: "active", game: "tower" }]));
      expect(JSON.parse(readJsonFileSync(legacyPath, "utf8", legacyGameRounds))).toHaveLength(1);

      const activityPath = join(directory, "activity.json");
      await writeFile(activityPath, JSON.stringify({ rooms: {} }));
      await writeFile(`${activityPath}.bak`, JSON.stringify({ users: {} }));
      expect(JSON.parse(readJsonFileSync(activityPath, "utf8", activityProgress))).toEqual({ users: {} });

      const partyPath = join(directory, "party.json");
      await writeFile(partyPath, JSON.stringify({ users: {} }));
      await writeFile(`${partyPath}.bak`, JSON.stringify({ rooms: {} }));
      expect(JSON.parse(readJsonFileSync(partyPath, "utf8", partyState))).toEqual({ rooms: {} });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a validator-mismatched new save without changing the primary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-store-shapes-"));
    const filePath = join(directory, "mines.json");
    const mines = [{ roundId: "mines-1", discordUserId: "user-1", phase: "active" }];
    try {
      writeJsonFile(filePath, mines, undefined, minesRounds);
      expect(() => writeJsonFile(filePath, [{ id: "duel-1", room: "room", status: "active", players: [] }], undefined, minesRounds)).toThrow("invalid shape");
      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(mines);
      expect(() => readJsonFile(filePath, [], rouletteRounds)).toThrow("invalid shape");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
