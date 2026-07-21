import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ActiveRound = {
  game: "mines";
  roundId: string;
  phase: "active";
  wallet: number;
  state: { bet: number; mineCount: number; revealed: number[]; multiplier: number; hit: boolean };
};

type MinesGame = {
  app: { profile: { data: { settings: { reducedMotion: boolean } } }; audio: { play: ReturnType<typeof vi.fn> }; toast: ReturnType<typeof vi.fn> };
  bet: number;
  mineCount: number;
  phase: string;
  mines: Set<number>;
  revealed: Set<number>;
  multiplier: number;
  showMines: boolean;
  remoteRoundId: string | null;
  render: ReturnType<typeof vi.fn>;
  clearReset: ReturnType<typeof vi.fn>;
  setTimeout: typeof setTimeout;
};

type CasinoApp = { gameInstance: MinesGame | null; openGame(id: string): void };
type LuxWindow = Window & {
  __LUX_CORE__?: { CasinoApp: new () => CasinoApp };
  __LUX_NOCTIS__?: CasinoApp;
  __IRIS_ACTIVE_ROUNDS__?: ActiveRound[];
  __IRIS_ACTIVITY_REQUESTS__?: { waitForUserScope(): Promise<string> };
};

const minesRound = (): ActiveRound => ({
  game: "mines",
  roundId: "mines-resume-1",
  phase: "active",
  wallet: 99_000,
  state: { bet: 1000, mineCount: 5, revealed: [2, 8], multiplier: 1.3, hit: false }
});

function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }

function mountMines(activeRounds: ActiveRound[], response: ActiveRound | null, status = 200) {
  const luxWindow = window as LuxWindow;
  const game: MinesGame = {
    app: { profile: { data: { settings: { reducedMotion: true } } }, audio: { play: vi.fn() }, toast: vi.fn() },
    bet: 100,
    mineCount: 3,
    phase: "idle",
    mines: new Set(),
    revealed: new Set(),
    multiplier: 1,
    showMines: false,
    remoteRoundId: null,
    render: vi.fn(),
    clearReset: vi.fn(),
    setTimeout
  };
  class TestCasinoApp implements CasinoApp {
    gameInstance: MinesGame | null = null;
    openGame(id: string) { if (id === "mines") this.gameInstance = game; }
  }
  const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: status < 400, round: response }), { status, headers: { "content-type": "application/json" } }));
  luxWindow.__LUX_CORE__ = { CasinoApp: TestCasinoApp };
  luxWindow.__LUX_NOCTIS__ = undefined;
  luxWindow.__IRIS_ACTIVE_ROUNDS__ = activeRounds;
  luxWindow.__IRIS_ACTIVITY_REQUESTS__ = { waitForUserScope: vi.fn().mockResolvedValue("user-a") };
  window.fetch = fetchMock as unknown as typeof fetch;
  window.eval(readFileSync(resolve(process.cwd(), "public/lux-noctis/expansion-activity.js"), "utf8"));
  const app = new TestCasinoApp();
  luxWindow.__LUX_NOCTIS__ = app;
  return { app, game, fetchMock };
}

function expectRestored(game: MinesGame) {
  expect(game.remoteRoundId).toBe("mines-resume-1");
  expect(game.phase).toBe("active");
  expect(game.bet).toBe(1000);
  expect(game.mineCount).toBe(5);
  expect([...game.revealed]).toEqual([2, 8]);
  expect(game.multiplier).toBe(1.3);
  expect(game.mines.size).toBe(0);
}

describe("Mines active-round restoration", () => {
  beforeEach(() => {
    const luxWindow = window as LuxWindow;
    luxWindow.__LUX_NOCTIS__ = undefined;
    luxWindow.__IRIS_ACTIVE_ROUNDS__ = [];
    localStorage.clear();
  });

  it("restores an active round that was announced before the Mines view opened", async () => {
    const round = minesRound();
    const { app, game, fetchMock } = mountMines([round], null);
    window.dispatchEvent(new CustomEvent("iris-active-round", { detail: round }));
    app.openGame("mines");
    await tick();
    expectRestored(game);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores an active round announced after the Mines view opened", async () => {
    const round = minesRound();
    const { app, game } = mountMines([], null);
    app.openGame("mines");
    window.dispatchEvent(new CustomEvent("iris-active-round", { detail: round }));
    await tick();
    expectRestored(game);
  });

  it("uses only the active-round GET endpoint during automatic recovery", async () => {
    const { app, fetchMock } = mountMines([], minesRound());
    app.openGame("mines");
    await tick();
    expect(fetchMock).toHaveBeenCalledWith("/api/games/mines/active-round", { credentials: "include", cache: "no-store" });
    expect(fetchMock.mock.calls.some(([path, init]) => path === "/api/games/mines/rounds" && init?.method === "POST")).toBe(false);
  });

  it("restores the complete active Mines state", async () => {
    const { app, game } = mountMines([], minesRound());
    app.openGame("mines");
    await tick();
    expectRestored(game);
  });

  it("keeps the normal idle view when no active round exists", async () => {
    const none = mountMines([], null);
    none.app.openGame("mines");
    await tick();
    expect(none.game.phase).toBe("idle");
  });

  it("keeps the normal idle view when the active-round lookup fails", async () => {
    const failed = mountMines([], null, 500);
    failed.app.openGame("mines");
    await tick();
    expect(failed.game.phase).toBe("idle");
  });
});
