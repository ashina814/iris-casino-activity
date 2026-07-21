import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonFile, readJsonFileSync, writeJsonFile } from "./atomic-json.js";

describe("atomic JSON storage", () => {
  it("writes atomically and recovers a syntactically corrupt primary file from one backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "state.json");
    try {
      writeJsonFile(filePath, { version: 1 });
      writeJsonFile(filePath, { version: 2 });
      await writeFile(filePath, "{broken", "utf8");
      expect(JSON.parse(readJsonFileSync(filePath))).toEqual({ version: 1 });
      expect(readJsonFile(filePath, { version: 0 }, (value): value is { version: number } => Boolean(value && typeof value === "object" && typeof (value as { version?: unknown }).version === "number"))).toEqual({ version: 1 });
      expect(await readFile(`${filePath}.bak`, "utf8")).toContain('"version":1');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not replace a valid backup with a corrupt primary during the next save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-atomic-json-"));
    const filePath = join(directory, "state.json");
    try {
      writeJsonFile(filePath, { version: 1 });
      writeJsonFile(filePath, { version: 2 });
      await writeFile(filePath, "{broken", "utf8");

      writeJsonFile(filePath, { version: 3 });

      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ version: 3 });
      expect(JSON.parse(await readFile(`${filePath}.bak`, "utf8"))).toEqual({ version: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
