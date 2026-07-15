import type { DiscordUser } from "@iris/shared";
import { AuthExchangeRequestSchema } from "@iris/shared";
import cookieSession from "cookie-session";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response as ExpressResponse } from "express";
import helmet from "helmet";
import { z } from "zod";
import { exchangeDiscordCode, mockDiscordUser } from "./auth/discord.js";
import { BlackjackService, FileBlackjackRoundStore, type BlackjackAction } from "./casino/blackjack.js";
import { BaccaratService, FileBaccaratRoundStore } from "./casino/baccarat.js";
import { FileRouletteRoundStore, RouletteService } from "./casino/roulette.js";
import { FilePokerRoundStore, PokerService } from "./casino/poker.js";
import { FileSicBoRoundStore, SicBoService } from "./casino/sicbo.js";
import { FileKenoRoundStore, KenoService } from "./casino/keno.js";
import { DragonService, FileDragonRoundStore } from "./casino/dragon.js";
import { FileWheelRoundStore, WheelService } from "./casino/wheel.js";
import { CrapsService, FileCrapsRoundStore } from "./casino/craps.js";
import { FilePlinkoRoundStore, PlinkoService } from "./casino/plinko.js";
import { FileHiLoRoundStore, HiLoService } from "./casino/hilo.js";
import { FileMinesRoundStore, MinesService } from "./casino/mines.js";
import { FileWarRoundStore, WarService } from "./casino/war.js";
import { BingoService, FileBingoStore } from "./casino/bingo.js";
import { FileScratchStore, ScratchService } from "./casino/scratch.js";
import { FileLegacyGameStore, LegacyGamesService } from "./casino/legacy-games.js";
import { FileSlotsRoundStore, SlotsService } from "./casino/slots.js";
import { loadEnv, type ServerEnv } from "./env.js";
import { AppError, asyncRoute, sendError } from "./errors.js";
import { createRateLimit } from "./middleware/rate-limit.js";
import { getWalletForDiscordUser } from "./services/wallet.js";
import { ActivityEconomyService, FileActivityProgressStore, isPurchaseId, isTreasuryItemId, isTreasuryPay } from "./services/activity-economy.js";
import { FilePartyStore, PartyService } from "./services/party.js";
import { DuelService, FileDuelStore } from "./services/duels.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface AppLogger {
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface CreateAppOptions {
  env?: Record<string, unknown>;
  fetch?: FetchLike;
  logger?: AppLogger;
  webDistPath?: string;
}

type IrisSession = CookieSessionInterfaces.CookieSessionObject & {
  user?: DiscordUser;
};

export function createApp(options: CreateAppOptions = {}) {
  const env = loadEnv(options.env);
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const logger = options.logger ?? console;
  const app = express();
  const activityCookieDomain = cookieDomain(env);
  const blackjack = new BlackjackService({
    env,
    fetch: fetchFn,
    store: new FileBlackjackRoundStore(env.CASINO_STATE_PATH)
  });
  const baccarat = new BaccaratService({ env, fetch: fetchFn, store: new FileBaccaratRoundStore(env.BACCARAT_STATE_PATH) });
  const roulette = new RouletteService({ env, fetch: fetchFn, store: new FileRouletteRoundStore(env.ROULETTE_STATE_PATH) });
  const slots = new SlotsService({ env, fetch: fetchFn, store: new FileSlotsRoundStore(env.SLOTS_STATE_PATH) });
  const poker = new PokerService({ env, fetch: fetchFn, store: new FilePokerRoundStore(env.POKER_STATE_PATH) });
  const sicbo = new SicBoService({ env, fetch: fetchFn, store: new FileSicBoRoundStore(env.SICBO_STATE_PATH) });
  const keno = new KenoService({ env, fetch: fetchFn, store: new FileKenoRoundStore(env.KENO_STATE_PATH) });
  const dragon = new DragonService({ env, fetch: fetchFn, store: new FileDragonRoundStore(env.DRAGON_STATE_PATH) });
  const wheel = new WheelService({ env, fetch: fetchFn, store: new FileWheelRoundStore(env.WHEEL_STATE_PATH) });
  const craps = new CrapsService({ env, fetch: fetchFn, store: new FileCrapsRoundStore(env.CRAPS_STATE_PATH) });
  const plinko = new PlinkoService({ env, fetch: fetchFn, store: new FilePlinkoRoundStore(env.PLINKO_STATE_PATH) });
  const hilo = new HiLoService({ env, fetch: fetchFn, store: new FileHiLoRoundStore(env.HILO_STATE_PATH) });
  const mines = new MinesService({ env, fetch: fetchFn, store: new FileMinesRoundStore(env.MINES_STATE_PATH) });
  const war = new WarService({ env, fetch: fetchFn, store: new FileWarRoundStore(env.WAR_STATE_PATH) });
  const bingo = new BingoService({ env, fetch: fetchFn, store: new FileBingoStore(env.BINGO_STATE_PATH) });
  const scratch = new ScratchService({ env, fetch: fetchFn, store: new FileScratchStore(env.SCRATCH_STATE_PATH) });
  const legacyGames = new LegacyGamesService({ env, fetch: fetchFn, store: new FileLegacyGameStore(env.LEGACY_GAMES_STATE_PATH) });
  const activityEconomy = new ActivityEconomyService({ env, fetch: fetchFn, store: new FileActivityProgressStore(env.ACTIVITY_PROGRESS_STATE_PATH) });
  const party = new PartyService({ store: new FilePartyStore(env.PARTY_STATE_PATH) });
  const duels = new DuelService(new FileDuelStore(env.DUEL_STATE_PATH));
  const reconciliation = Promise.all([
    roulette.reconcileAll(),
    slots.reconcileAll(),
    baccarat.reconcileAll(),
    poker.reconcileAll(),
    sicbo.reconcileAll(),
    keno.reconcileAll(),
    dragon.reconcileAll(),
    wheel.reconcileAll(),
    craps.reconcileAll(),
    plinko.reconcileAll(),
    hilo.reconcileAll(),
    mines.reconcileAll(),
    war.reconcileAll(),
    bingo.reconcileAll(),
    scratch.reconcileAll(),
    legacyGames.reconcileAll()
  ]);
  void reconciliation.catch((error: unknown) => logger.error("casino_reconcile_failed", {
    message: error instanceof Error ? error.message : "unknown reconciliation error"
  }));
  app.locals.reconciliation = reconciliation;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet(activityHelmetOptions(env)));
  if (options.webDistPath) {
    app.use(express.static(options.webDistPath, {
      setHeaders(res, path) {
        const normalizedPath = path.replaceAll("\\", "/");
        // Lux Noctis files are not fingerprinted, so clients must revalidate them on every Activity launch.
        if (
          path.endsWith("index.html")
          || (normalizedPath.includes("/lux-noctis/") && /\.(?:css|html|js)$/u.test(normalizedPath))
        ) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }));
  }
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origin === env.WEB_ORIGIN || origin === activityOrigin(activityCookieDomain)) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, "forbidden_origin", "Origin is not allowed."));
      }
    })
  );
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", createRateLimit({ max: 600, windowMs: 60_000, key: requestIp }));
  app.use("/api/auth", createRateLimit({ max: 60, windowMs: 60_000, key: requestIp }));
  app.use("/api/games", createRateLimit({ max: 300, windowMs: 60_000, key: requestPlayer }));
  app.use(
    cookieSession({
      name: "iris_session",
      keys: [sessionSecret(env)],
      httpOnly: true,
      domain: activityCookieDomain,
      sameSite: env.DISCORD_ACTIVITY_MODE ? "none" : "lax",
      secure: env.NODE_ENV === "production",
      partitioned: env.DISCORD_ACTIVITY_MODE,
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

  app.get("/api/config", (_req, res) => {
    res.json({
      ok: true,
      discordClientId: env.DISCORD_CLIENT_ID,
      mockAuth: env.IRIS_MOCK_AUTH
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

  app.get(
    "/api/economy/daily",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, daily: await activityEconomy.dailyStatus(user) });
    })
  );

  app.post(
    "/api/economy/daily/claim",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, daily: await activityEconomy.claimDaily(user) });
    })
  );

  app.post(
    "/api/economy/relief",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, relief: await activityEconomy.claimRelief(user) });
    })
  );

  app.get(
    "/api/economy/missions",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, missions: await activityEconomy.missionStatus(user) });
    })
  );
  app.get("/api/economy/weekly", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, weekly: await activityEconomy.weeklyStatus(user) }); }));
  app.post("/api/economy/weekly/:id/claim", asyncRoute(async (req, res) => { const user = getSession(req).user; const id = z.string().min(1).max(32).safeParse(req.params.id); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!id.success) throw new AppError(400, "bad_request", "Weekly contract is invalid."); res.json({ ok: true, weekly: await activityEconomy.claimWeekly(user, id.data) }); }));
  app.get("/api/economy/ascension", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, ascension: activityEconomy.ascensionStatus(user) }); }));
  app.post("/api/economy/ascension/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ mastery: z.record(z.string().max(32), z.object({ xp: z.number().int().min(0).max(10_000_000), level: z.number().int().min(1).max(50), rounds: z.number().int().min(0).max(10_000_000), wins: z.number().int().min(0).max(10_000_000) })), nodes: z.array(z.string().max(32)).max(24), points: z.number().int().min(0).max(100) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Ascension migration is invalid."); res.json({ ok: true, ascension: activityEconomy.migrateAscension(user, body.data) }); }));
  app.post("/api/economy/ascension/nodes/:id", asyncRoute(async (req, res) => { const user = getSession(req).user; const id = z.string().min(1).max(32).safeParse(req.params.id); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!id.success) throw new AppError(400, "bad_request", "Constellation node is invalid."); res.json({ ok: true, ascension: activityEconomy.unlockConstellation(user, id.data) }); }));
  app.get("/api/economy/eternal", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, eternal: activityEconomy.eternalStatus(user) }); }));
  app.post("/api/economy/eternal/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const rank = z.object({ level: z.number().int().min(1).max(100), xp: z.number().int().min(0).max(100_000_000), totalXp: z.number().int().min(0).max(1_000_000_000), points: z.number().int().min(0).max(100), nodes: z.record(z.string().max(16), z.number().int().min(1).max(3)) }); const district = z.object({ level: z.number().int().min(1).max(30), xp: z.number().int().min(0).max(100_000_000), rounds: z.number().int().min(0).max(100_000_000), wins: z.number().int().min(0).max(100_000_000) }); const dealer = z.object({ level: z.number().int().min(1).max(10), xp: z.number().int().min(0).max(100_000_000), rounds: z.number().int().min(0).max(100_000_000), chapters: z.number().int().min(1).max(5) }); const stats = z.object({ rounds: z.number().int().min(0).max(100_000_000), newGames: z.number().int().min(0).max(100_000_000), holdemWins: z.number().int().min(0).max(100_000_000), warWins: z.number().int().min(0).max(100_000_000), bingos: z.number().int().min(0).max(100_000_000), towerSummits: z.number().int().min(0).max(100_000_000), scratchWins: z.number().int().min(0).max(100_000_000), artifactsFound: z.number().int().min(0).max(100_000_000), odysseyClears: z.number().int().min(0).max(100_000_000) }); const body = z.object({ renown: rank, districts: z.record(z.string().max(16), district), dealers: z.record(z.string().max(16), dealer), omen: z.object({ active: z.string().nullable(), remaining: z.number().int().min(0).max(10), nextIn: z.number().int().min(0).max(20) }), stats }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Eternal migration is invalid."); res.json({ ok: true, eternal: activityEconomy.migrateEternal(user, body.data) }); }));
  app.post("/api/economy/eternal/talents/:id", asyncRoute(async (req, res) => { const user = getSession(req).user; const id = z.string().regex(/^(fame|bond|relic|odyssey|league)-[0-5]$/).safeParse(req.params.id); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!id.success) throw new AppError(400, "bad_request", "Eternal talent is invalid."); res.json({ ok: true, eternal: activityEconomy.unlockEternalTalent(user, id.data as never) }); }));
  app.get("/api/economy/duel-profile", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, duel: activityEconomy.duelProfileStatus(user) }); }));
  app.post("/api/economy/duel-profile/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ rating: z.number().int().min(500).max(10_000), medals: z.number().int().min(0).max(10_000_000), wins: z.number().int().min(0).max(10_000_000), losses: z.number().int().min(0).max(10_000_000), ties: z.number().int().min(0).max(10_000_000), streak: z.number().int().min(0).max(10_000_000), bestStreak: z.number().int().min(0).max(10_000_000), matches: z.number().int().min(0).max(10_000_000), weeklyShieldUsed: z.string().max(16) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Duel profile migration is invalid."); res.json({ ok: true, duel: activityEconomy.migrateDuelProfile(user, body.data) }); }));
  app.get("/api/economy/mystery", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, mystery: await activityEconomy.mysteryStatus(user) }); }));
  app.post("/api/economy/mystery/:offerId/claim", asyncRoute(async (req, res) => {
    const user = getSession(req).user;
    const offerId = z.string().regex(/^\d{1,20}-\d{1,6}$/).safeParse(req.params.offerId);
    const body = z.object({ index: z.number().int().min(0).max(2) }).safeParse(req.body);
    if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
    if (!offerId.success || !body.success) throw new AppError(400, "bad_request", "Mystery reward is invalid.");
    res.json({ ok: true, mystery: await activityEconomy.claimMystery(user, offerId.data, body.data.index) });
  }));
  app.get("/api/economy/season", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, season: await activityEconomy.seasonStatus(user) }); }));
  app.post("/api/economy/season/:tier/claim", asyncRoute(async (req, res) => { const user = getSession(req).user; const tier = z.coerce.number().int().min(1).max(40).safeParse(req.params.tier); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!tier.success) throw new AppError(400, "bad_request", "Season reward is invalid."); res.json({ ok: true, season: await activityEconomy.claimSeason(user, tier.data) }); }));
  app.get("/api/economy/circuit", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, circuit: await activityEconomy.circuitStatus(user) }); }));
  app.post("/api/economy/circuit/start", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, circuit: await activityEconomy.startCircuit(user) }); }));
  app.get("/api/economy/odyssey", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, odyssey: await activityEconomy.odysseyStatus(user) }); }));
  app.post("/api/economy/odyssey/start", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, odyssey: await activityEconomy.startOdyssey(user) }); }));
  app.post("/api/economy/odyssey/select", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ index: z.number().int().min(0).max(2) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Odyssey route is invalid."); res.json({ ok: true, odyssey: await activityEconomy.selectOdysseyNode(user, body.data.index) }); }));
  app.post("/api/economy/odyssey/boon", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ boon: z.enum(["life", "coins", "key", "shield", "fame", "score"]) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Odyssey boon is invalid."); res.json({ ok: true, odyssey: await activityEconomy.chooseOdysseyBoon(user, body.data.boon) }); }));
  app.post("/api/economy/odyssey/abandon", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, odyssey: activityEconomy.abandonOdyssey(user) }); }));
  app.get("/api/economy/albums", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, albums: await activityEconomy.albumStatus(user) }); }));
  app.post("/api/economy/albums/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ owned: z.array(z.string().max(32)).max(72), capsules: z.number().int().min(0).max(100_000), dust: z.number().int().min(0).max(10_000_000), shards: z.number().int().min(0).max(10_000_000), opened: z.number().int().min(0).max(1_000_000), duplicates: z.number().int().min(0).max(1_000_000) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Collection migration is invalid."); res.json({ ok: true, albums: await activityEconomy.migrateAlbumCollection(user, body.data.owned, body.data) }); }));
  app.post("/api/economy/collection/open", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, drop: await activityEconomy.openCollectionCapsule(user) }); }));
  app.post("/api/economy/collection/craft", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, drop: await activityEconomy.craftCollectionLegendary(user) }); }));
  app.post("/api/economy/albums/:series/claim", asyncRoute(async (req, res) => { const user = getSession(req).user; const series = z.string().min(1).max(32).safeParse(req.params.series); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!series.success) throw new AppError(400, "bad_request", "Album is invalid."); res.json({ ok: true, album: await activityEconomy.claimAlbum(user, series.data) }); }));
  app.get("/api/economy/sovereign", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, sovereign: await activityEconomy.sovereignStatus(user) }); }));
  app.post("/api/economy/sovereign/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const stat = z.object({ rounds: z.number().int().min(0).max(10_000_000), wins: z.number().int().min(0).max(10_000_000), best: z.number().nonnegative().finite().max(100_000), biggest: z.number().int().min(0).max(1_000_000_000), scoreMax: z.number().int().min(0).max(1_000_000_000) }); const body = z.object({ marks: z.number().int().min(0).max(9999), chests: z.number().int().min(0).max(9999), stats: z.record(z.string().max(32), stat).optional(), medals: z.record(z.string().max(32), z.number().int().min(0).max(9_999_999_999_999)).optional(), special: z.object({ threecardSF: z.boolean().optional(), derbyUnderdog: z.boolean().optional(), ascentTen: z.boolean().optional(), arcanaPerfect: z.boolean().optional(), moonshotPerfect: z.boolean().optional(), towerSummit: z.boolean().optional(), scratchWin: z.boolean().optional() }).optional(), streak: z.number().int().min(0).max(10_000_000).optional(), bestStreak: z.number().int().min(0).max(10_000_000).optional(), prestige: z.number().int().min(0).max(10_000_000).optional() }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Sovereign migration is invalid."); res.json({ ok: true, sovereign: await activityEconomy.migrateSovereign(user, body.data.marks, body.data.chests, body.data) }); }));
  app.post("/api/economy/sovereign/chest", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, chest: await activityEconomy.openSovereignChest(user) }); }));
  app.get("/api/economy/artifacts", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, artifacts: await activityEconomy.artifactStatus(user) }); }));
  app.post("/api/economy/artifacts/migrate", asyncRoute(async (req, res) => { const user = getSession(req).user; const body = z.object({ owned: z.array(z.string().max(32)).max(48), keys: z.number().int().min(0).max(100_000), fragments: z.number().int().min(0).max(29), opened: z.number().int().min(0).max(1_000_000), duplicates: z.number().int().min(0).max(1_000_000), shards: z.number().int().min(0).max(10_000_000) }).safeParse(req.body); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!body.success) throw new AppError(400, "bad_request", "Artifact migration is invalid."); res.json({ ok: true, artifacts: await activityEconomy.migrateArtifacts(user, body.data.owned, body.data) }); }));
  app.post("/api/economy/artifacts/open", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, vault: await activityEconomy.openArtifactVault(user) }); }));
  app.post("/api/economy/artifacts/craft", asyncRoute(async (req, res) => { const user = getSession(req).user; if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); res.json({ ok: true, craft: await activityEconomy.craftArtifact(user) }); }));
  app.post("/api/economy/artifacts/:set/claim", asyncRoute(async (req, res) => { const user = getSession(req).user; const set = z.string().min(1).max(32).safeParse(req.params.set); if (!user) throw new AppError(401, "unauthorized", "Authentication is required."); if (!set.success) throw new AppError(400, "bad_request", "Artifact set is invalid."); res.json({ ok: true, artifact: await activityEconomy.claimArtifactSet(user, set.data) }); }));

  app.get(
    "/api/economy/vault",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, vault: await activityEconomy.vaultStatus(user) });
    })
  );

  app.get(
    "/api/economy/night-event",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, nightEvent: await activityEconomy.nightEventStatus(user) });
    })
  );

  app.post(
    "/api/economy/vault/claim",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ chestIndex: z.number().int().min(0).max(2) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Vault chest is invalid.");
      res.json({ ok: true, vault: await activityEconomy.claimVault(user, parsed.data.chestIndex) });
    })
  );

  app.get(
    "/api/economy/treasury",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      res.json({ ok: true, treasury: await activityEconomy.treasuryStatus(user) });
    })
  );

  app.post(
    "/api/economy/treasury/purchases",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ purchaseId: z.string(), itemId: z.string(), pay: z.string() }).safeParse(req.body);
      if (!parsed.success || !isPurchaseId(parsed.data.purchaseId) || !isTreasuryItemId(parsed.data.itemId) || !isTreasuryPay(parsed.data.pay)) {
        throw new AppError(400, "bad_request", "Treasury purchase is invalid.");
      }
      res.json({ ok: true, treasury: await activityEconomy.purchaseTreasury(user, parsed.data.purchaseId, parsed.data.itemId, parsed.data.pay) });
    })
  );

  app.post(
    "/api/party/join",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = partyRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Party join is invalid.");
      res.json(party.join(user, parsed.data.room, parsed.data.appearance));
    })
  );

  app.post(
    "/api/party/presence",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = partyRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Party presence is invalid.");
      res.json(party.presence(user, parsed.data.room, parsed.data.appearance));
    })
  );

  app.post(
    "/api/party/events",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ room: partyRoomSchema, kind: z.enum(["reaction", "win"]), payload: z.object({ emoji: z.string().max(8).optional() }).default({}) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Party event is invalid.");
      res.json(party.publish(user, parsed.data.room, parsed.data.kind, parsed.data.payload));
    })
  );

  app.post(
    "/api/party/crowns/:crownId/claim",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const crownId = z.string().uuid().safeParse(req.params.crownId);
      const parsed = z.object({ room: partyRoomSchema }).safeParse(req.body);
      if (!crownId.success || !parsed.success) throw new AppError(400, "bad_request", "Party Crown claim is invalid.");
      if (!party.canClaimCrown(user.id, parsed.data.room, crownId.data)) throw new AppError(403, "unauthorized", "Party Crown is unavailable.");
      res.json({ ok: true, crown: await activityEconomy.claimPartyCrown(user, crownId.data) });
    })
  );

  app.post(
    "/api/league/submit",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ room: partyRoomSchema }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Night League sync is invalid.");
      const league = party.submitLeague(user.id, parsed.data.room);
      if (!league) throw new AppError(403, "unauthorized", "Join the party room before syncing Night League.");
      res.json({ ok: true, ...league });
    })
  );
  app.get("/api/raid/state", (req, res) => {
    const user = getSession(req).user; const room = partyRoomSchema.safeParse(req.query.room);
    if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
    if (!room.success) throw new AppError(400, "bad_request", "Party room is invalid.");
    const raid = party.raidState(user.id, room.data);
    if (!raid) throw new AppError(403, "unauthorized", "Join the party room before viewing the raid.");
    res.json({ ok: true, raid });
  });
  app.post("/api/raid/:raidId/claim", asyncRoute(async (req, res) => {
    const user = getSession(req).user; const room = partyRoomSchema.safeParse(req.body?.room); const raidId = z.string().uuid().safeParse(req.params.raidId);
    if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
    if (!room.success || !raidId.success) throw new AppError(400, "bad_request", "Raid claim is invalid.");
    if (!party.canClaimRaid(user.id, room.data, raidId.data)) throw new AppError(403, "unauthorized", "Raid reward is unavailable.");
    res.json({ ok: true, raid: await activityEconomy.claimRaid(user, raidId.data) });
  }));
  app.post("/api/duel/claim", asyncRoute(async (req,res)=>{const user=getSession(req).user;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");try{const matchId=String(req.body?.matchId||"");const claimed=duels.claim(user.id,matchId);const result=claimed.result==="win"||claimed.result==="tie"?claimed.result:"loss";const reward=claimed.alreadyClaimed?{amount:0,medals:0,alreadyClaimed:true,wallet:null,currency:"Ris",duel:activityEconomy.duelProfileStatus(user),season:null}:await activityEconomy.claimDuel(user,matchId,claimed.amount,result,claimed.mode);const alreadyClaimed=claimed.alreadyClaimed||reward.alreadyClaimed;if(!alreadyClaimed)duels.markClaim(user.id,matchId);res.json({ok:true,alreadyClaimed,result,reward:{coins:reward.amount,medals:reward.medals},wallet:reward.wallet,currency:reward.currency,season:reward.season,duel:reward.duel})}catch(error){throw new AppError(409,"casino_transaction_conflict",error instanceof Error?error.message:"Duel reward failed.")}}));
  app.post("/api/duel/:kind", asyncRoute(async (req,res)=>{const user=getSession(req).user;const kind=req.params.kind;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");const body=z.object({room:partyRoomSchema,mode:z.string().optional(),code:z.string().optional(),glyph:z.string().optional()}).passthrough().safeParse(req.body);if(!body.success)throw new AppError(400,"bad_request","Duel request is invalid.");if(!party.isMember(user.id,body.data.room))throw new AppError(403,"unauthorized","Join the party room before starting a duel.");try{const glyph=body.data.glyph||"♛";const match=kind==="create"?duels.create(user,body.data.room,body.data.mode||"",glyph):kind==="queue"?duels.queue(user,body.data.room,body.data.mode||"",glyph):kind==="join"?duels.join(user,body.data.room,body.data.code||"",glyph):null;if(!match)throw new Error("Invalid duel request.");res.json({ok:true,match});}catch(error){throw new AppError(409,"casino_transaction_conflict",error instanceof Error?error.message:"Duel failed.")}}));
  app.get("/api/duel/state",(req,res)=>{const user=getSession(req).user;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");try{res.json({ok:true,match:duels.state(user.id,String(req.query.match||""))})}catch{throw new AppError(404,"not_found","Match was not found.")}});
  app.post("/api/duel/action",asyncRoute(async(req,res)=>{const user=getSession(req).user;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");try{res.json({ok:true,match:duels.action(user.id,String(req.body?.matchId||""),req.body?.action||{})})}catch(error){throw new AppError(409,"casino_transaction_conflict",error instanceof Error?error.message:"Duel action failed.")}}));
  app.post("/api/duel/leave",asyncRoute(async(req,res)=>{const user=getSession(req).user;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");res.json({ok:true,match:duels.leave(user.id,String(req.body?.matchId||""))})}));

  app.get("/api/party/events", (req, res) => {
    const user = getSession(req).user;
    const room = partyRoomSchema.safeParse(req.query.room);
    if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
    if (!room.success) throw new AppError(400, "bad_request", "Party room is invalid.");
    openPartyEventStream(res, req, party.subscribe(room.data, user.id, (message) => writePartyEvent(res, message)));
  });

  app.post(
    "/api/games/blackjack/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Blackjack bet is invalid.");

      const round = await blackjack.start(user, parsed.data.roundId, parsed.data.bet);
      await recordBlackjackMission(activityEconomy, party, user, round);
      res.status(201).json({ ok: true, round: blackjack.publicState(round) });
    })
  );

  app.get(
    "/api/games/blackjack/rounds/:roundId",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const roundId = req.params.roundId;
      if (!roundId) throw new AppError(400, "bad_request", "Blackjack round is invalid.");
      const round = await blackjack.get(user, roundId);
      await recordBlackjackMission(activityEconomy, party, user, round);
      res.json({ ok: true, round: blackjack.publicState(round) });
    })
  );

  app.post(
    "/api/games/blackjack/rounds/:roundId/actions",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const roundId = req.params.roundId;
      if (!roundId) throw new AppError(400, "bad_request", "Blackjack round is invalid.");
      const parsed = z.object({ actionId: z.string().min(1).max(128), action: z.enum(["hit", "stand", "double", "split"]) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Blackjack action is invalid.");

      const round = await blackjack.act(user, roundId, parsed.data.actionId, parsed.data.action as BlackjackAction);
      await recordBlackjackMission(activityEconomy, party, user, round);
      res.json({ ok: true, round: blackjack.publicState(round) });
    })
  );

  app.post(
    "/api/games/scratch/tickets",
    asyncRoute(async (req, res) => { const user=getSession(req).user;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");const p=z.object({ticketId:z.string().min(1).max(128),bet:z.number().int().positive().safe()}).safeParse(req.body);if(!p.success)throw new AppError(400,"bad_request","Scratch ticket invalid.");res.status(201).json({ok:true,ticket:await scratch.issue(user,p.data.ticketId,p.data.bet)}); })
  );
  app.post(
    "/api/games/scratch/tickets/:ticketId/reveal",
    asyncRoute(async (req, res) => { const user=getSession(req).user, id=req.params.ticketId;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");const p=z.object({actionId:z.string().min(1).max(128),index:z.number().int()}).safeParse(req.body);if(!id||!p.success)throw new AppError(400,"bad_request","Scratch reveal invalid.");const ticket=await scratch.reveal(user,id,p.data.actionId,p.data.index);await recordMissionIfSettled(activityEconomy,party,user,"scratch",ticket.ticketId,ticket.bet,ticket.payout,ticket.phase);res.json({ok:true,ticket}); })
  );
  app.post(
    "/api/games/scratch/tickets/:ticketId/reveal-all",
    asyncRoute(async (req, res) => { const user=getSession(req).user, id=req.params.ticketId;if(!user)throw new AppError(401,"unauthorized","Authentication is required.");const p=z.object({actionId:z.string().min(1).max(128)}).safeParse(req.body);if(!id||!p.success)throw new AppError(400,"bad_request","Scratch reveal invalid.");const ticket=await scratch.revealAll(user,id,p.data.actionId);await recordMissionIfSettled(activityEconomy,party,user,"scratch",ticket.ticketId,ticket.bet,ticket.payout,ticket.phase);res.json({ok:true,ticket}); })
  );

  app.post(
    "/api/games/bingo/draws",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ drawId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Bingo ticket is invalid.");
      const draw = await bingo.play(user, parsed.data.drawId, parsed.data.bet); await recordMissionIfSettled(activityEconomy,party,user,"bingo",draw.drawId,draw.bet,draw.payout,draw.phase); res.json({ ok: true, draw });
    })
  );

  app.post(
    "/api/games/war/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "War round is invalid.");
      const round = await war.deal(user, parsed.data.roundId, parsed.data.bet); await recordMissionIfSettled(activityEconomy,party,user,"war",round.roundId,round.bet,round.payout,round.phase); res.status(201).json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/war/rounds/:roundId/actions",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128), action: z.enum(["surrender", "war"]) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "War action is invalid.");
      const round = await war.act(user, roundId, parsed.data.actionId, parsed.data.action); await recordMissionIfSettled(activityEconomy,party,user,"war",round.roundId,round.bet,round.payout,round.phase); res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/mines/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe(), mineCount: z.number().int() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Mines round is invalid.");
      const round = await mines.start(user, parsed.data.roundId, parsed.data.bet, parsed.data.mineCount); await recordMissionIfSettled(activityEconomy,party,user,"mines",round.roundId,round.bet,round.payout,round.phase); res.status(201).json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/mines/rounds/:roundId/reveal",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128), index: z.number().int() }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Mines reveal is invalid.");
      const round = await mines.reveal(user, roundId, parsed.data.actionId, parsed.data.index); await recordMissionIfSettled(activityEconomy,party,user,"mines",round.roundId,round.bet,round.payout,round.phase); res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/mines/rounds/:roundId/cash",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Mines cash action is invalid.");
      const round = await mines.cash(user, roundId, parsed.data.actionId); await recordMissionIfSettled(activityEconomy,party,user,"mines",round.roundId,round.bet,round.payout,round.phase); res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/hilo/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Hi-Lo round is invalid.");
      const round = await hilo.start(user, parsed.data.roundId, parsed.data.bet);
      await recordMissionIfSettled(activityEconomy,party,user,"hilo",round.roundId,round.bet,round.payout,round.phase); res.status(201).json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/hilo/rounds/:roundId/guess",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128), direction: z.enum(["low", "high"]) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Hi-Lo guess is invalid.");
      const round = await hilo.guess(user, roundId, parsed.data.actionId, parsed.data.direction);
      await recordMissionIfSettled(activityEconomy,party,user,"hilo",round.roundId,round.bet,round.payout,round.phase); res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/hilo/rounds/:roundId/cash",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Hi-Lo cash action is invalid.");
      const round = await hilo.cash(user, roundId, parsed.data.actionId);
      await recordMissionIfSettled(activityEconomy,party,user,"hilo",round.roundId,round.bet,round.payout,round.phase); res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/plinko/drops",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ dropId: z.string().min(1).max(128), bet: z.number().int().positive().safe(), risk: z.enum(["low", "medium", "high"]) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Plinko drop is invalid.");
      const drop = await plinko.drop(user, parsed.data.dropId, parsed.data.bet, parsed.data.risk);
      await recordMissionIfSettled(activityEconomy,party,user,"plinko",drop.dropId,drop.bet,drop.payout,drop.phase); res.json({ ok: true, drop });
    })
  );

  app.post(
    "/api/games/craps/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), selection: z.enum(["pass", "dont", "field", "any7", "exact6", "exact8"]), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Craps round is invalid.");
      const round = await craps.start(user, parsed.data.roundId, parsed.data.selection, parsed.data.bet);
      await recordMissionIfSettled(activityEconomy,party,user,"craps",round.roundId,round.bet,round.payout,round.phase);
      res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/craps/rounds/:roundId/roll",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Craps round is invalid.");
      const round = await craps.roll(user, roundId, parsed.data.actionId);
      await recordMissionIfSettled(activityEconomy,party,user,"craps",round.roundId,round.bet,round.payout,round.phase);
      res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/dragon/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), selection: z.enum(["dragon", "tiger", "tie", "suited"]), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Dragon round is invalid.");
      const round = await dragon.deal(user, parsed.data.roundId, parsed.data.selection, parsed.data.bet);
      await recordMissionIfSettled(activityEconomy,party,user,"dragon",round.roundId,round.bet,round.payout,round.phase);
      res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/wheel/spins",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ spinId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Wheel spin is invalid.");
      const spin = await wheel.spin(user, parsed.data.spinId, parsed.data.bet);
      await recordMissionIfSettled(activityEconomy,party,user,"wheel",spin.spinId,spin.bet,spin.payout,spin.phase);
      res.json({ ok: true, spin });
    })
  );

  app.post(
    "/api/games/keno/draws",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ drawId: z.string().min(1).max(128), bet: z.number().int().positive().safe(), picks: z.array(z.number().int().min(1).max(40)).min(5).max(10) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Keno draw is invalid.");
      const draw = await keno.draw(user, parsed.data.drawId, parsed.data.bet, parsed.data.picks);
      await recordActivityRound(activityEconomy, party, user, { id: `keno-${draw.drawId}`, wager: draw.bet, payout: draw.payout ?? 0, events: draw.hits !== null && draw.hits >= 4 ? { kenoFour: 1 } : {} });
      res.json({ ok: true, draw });
    })
  );

  app.post(
    "/api/games/sicbo/spins",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ spinId: z.string().min(1).max(128), bets: z.array(z.object({ selection: z.string().min(1).max(32), amount: z.number().int().positive().safe() })).min(1).max(64) }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Sic Bo spin is invalid.");
      const spin = await sicbo.roll(user, parsed.data.spinId, parsed.data.bets);
      await recordActivityRound(activityEconomy, party, user, { id: `sicbo-${spin.spinId}`, wager: spin.total, payout: spin.payout ?? 0, events: { sicboRound: 1 } });
      res.json({ ok: true, spin });
    })
  );

  app.post(
    "/api/games/poker/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Poker round is invalid.");
      const round = await poker.deal(user, parsed.data.roundId, parsed.data.bet);
      res.status(201).json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/poker/rounds/:roundId/draw",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const roundId = req.params.roundId;
      const parsed = z.object({ held: z.array(z.boolean()).length(5) }).safeParse(req.body);
      if (!roundId || !parsed.success) throw new AppError(400, "bad_request", "Poker draw is invalid.");
      const round = await poker.draw(user, roundId, parsed.data.held);
      if (round.phase === "settled") await recordActivityRound(activityEconomy, party, user, { id: `poker-${round.roundId}`, wager: round.bet, payout: round.payout ?? 0, events: round.result && round.result.rank >= 4 ? { pokerGood: 1 } : {} });
      res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/baccarat/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({
        roundId: z.string().min(1).max(128),
        bets: z.array(z.object({ selection: z.enum(["player", "banker", "tie", "playerPair", "bankerPair"]), amount: z.number().int().positive().safe() })).min(1).max(5)
      }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Baccarat round is invalid.");
      const round = await baccarat.deal(user, parsed.data.roundId, parsed.data.bets);
      await recordActivityRound(activityEconomy, party, user, { id: `baccarat-${round.roundId}`, wager: round.total, payout: round.payout ?? 0, events: { baccaratRound: 1 } });
      res.json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/roulette/spins",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({
        spinId: z.string().min(1).max(128),
        bets: z.array(z.object({ selection: z.string().min(1).max(32), amount: z.number().int().positive().safe() })).min(1).max(64)
      }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Roulette spin is invalid.");

      const round = await roulette.spin(user, parsed.data.spinId, parsed.data.bets);
      await recordActivityRound(activityEconomy, party, user, { id: `roulette-${round.spinId}`, wager: round.total, payout: round.payout ?? 0, events: round.number !== null && round.bets.some((bet) => bet.selection === `n:${round.number}`) ? { rouletteStraight: 1 } : {} });
      res.json({ ok: true, spin: round });
    })
  );

  app.post(
    "/api/games/slots/spins",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ spinId: z.string().min(1).max(128), bet: z.number().int() }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "bad_request", "Slots spin is invalid.");
      const spin = await slots.spin(user, parsed.data.spinId, parsed.data.bet);
      await recordActivityRound(activityEconomy, party, user, { id: `slots-${spin.spinId}`, wager: spin.wager, payout: spin.payout ?? 0, events: { freeSpins: spin.awarded, slotCascade: spin.cascades.length } });
      res.json({ ok: true, spin });
    })
  );

  app.post(
    "/api/games/:game/rounds",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ roundId: z.string().min(1).max(128), bet: z.number().int().positive().safe(), pairPlus: z.boolean().optional(), selection: z.number().int().optional(), auto: z.number().finite().optional() }).safeParse(req.body);
      const game = req.params.game;
      if (!parsed.success || !game || !["holdem", "tower", "threecard", "derby", "ascent", "arcana", "moonshot"].includes(game)) throw new AppError(400, "bad_request", "Game round is invalid.");
      const round = await legacyGames.start(user, game as "holdem" | "tower" | "threecard" | "derby" | "ascent" | "arcana" | "moonshot", parsed.data.roundId, parsed.data.bet, parsed.data);
      await recordMissionIfSettled(activityEconomy,party,user,game,round.id,round.bet,round.payout,round.phase,round.sovereign);
      res.status(201).json({ ok: true, round });
    })
  );

  app.post(
    "/api/games/:game/rounds/:roundId/actions",
    asyncRoute(async (req, res) => {
      const user = getSession(req).user; const game = req.params.game; const roundId = req.params.roundId;
      if (!user) throw new AppError(401, "unauthorized", "Authentication is required.");
      const parsed = z.object({ actionId: z.string().min(1).max(128), action: z.string().min(1).max(32), door: z.number().int().optional(), index: z.number().int().optional() }).safeParse(req.body);
      if (!roundId || !game || !parsed.success || !["holdem", "tower", "threecard", "ascent", "arcana", "moonshot"].includes(game)) throw new AppError(400, "bad_request", "Game action is invalid.");
      const round = await legacyGames.action(user, roundId, parsed.data.actionId, parsed.data.action, parsed.data);
      await recordMissionIfSettled(activityEconomy,party,user,game,round.id,round.bet,round.payout,round.phase,round.sovereign);
      res.json({ ok: true, round });
    })
  );

  app.use((req, res, next) => {
    if (options.webDistPath && req.method === "GET" && !req.path.startsWith("/api/")) {
      res.sendFile("index.html", { root: options.webDistPath });
      return;
    }
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

function cookieDomain(env: ServerEnv): string | undefined {
  if (!env.DISCORD_ACTIVITY_MODE) return undefined;
  return env.ACTIVITY_COOKIE_DOMAIN || `${env.DISCORD_CLIENT_ID}.discordsays.com`;
}

function activityOrigin(domain: string | undefined): string | undefined {
  return domain ? `https://${domain}` : undefined;
}

function requestIp(req: Request): string {
  return req.ip || "unknown";
}

function requestPlayer(req: Request): string {
  return getSession(req).user?.id || requestIp(req);
}

const partyRoomSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const partyRequestSchema = z.object({
  room: partyRoomSchema,
  appearance: z.object({
    level: z.number().int().min(1).max(999),
    game: z.string().min(1).max(40),
    glyph: z.string().min(1).max(8)
  })
});

function openPartyEventStream(res: ExpressResponse, req: Request, unsubscribe: (() => void) | null) {
  if (!unsubscribe) throw new AppError(404, "not_found", "Join the party room before subscribing.");
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function writePartyEvent(res: ExpressResponse, message: unknown) {
  res.write(`data: ${JSON.stringify(message)}\n\n`);
}

async function recordBlackjackMission(activityEconomy: ActivityEconomyService, party: PartyService, user: DiscordUser, round: { id: string; phase: string; hands: { stakes: { bet: number }[]; result?: string }[]; settlements?: { payout: number }[] }) {
  if (round.phase !== "settled") return;
  await recordActivityRound(activityEconomy, party, user, {
    id: `blackjack-${round.id}`,
    wager: round.hands.flatMap((hand) => hand.stakes).reduce((total, stake) => total + stake.bet, 0),
    payout: (round.settlements ?? []).reduce((total, settlement) => total + settlement.payout, 0),
    events: round.hands.some((hand) => hand.result === "BLACKJACK") ? { blackjack: 1 } : {}
  });
}

async function recordMissionIfSettled(activityEconomy: ActivityEconomyService, party: PartyService, user: DiscordUser, game: string, id: string, wager: number, payout: number | null, phase: string, sovereign?: { score?: number; events?: Record<string, boolean> }) {
  if (phase !== "settled") return;
  await recordActivityRound(activityEconomy, party, user, { id: `${game}-${id}`, wager, payout: payout ?? 0, score: sovereign?.score, sovereignEvents: { ...sovereign?.events, ...(game === "scratch" && (payout ?? 0) > wager ? { scratchWin: true } : {}) } });
}

async function recordActivityRound(activityEconomy: ActivityEconomyService, party: PartyService, user: DiscordUser, round: Parameters<ActivityEconomyService["recordMissionRound"]>[1]) {
  const game = round.game ?? round.id.split("-", 1)[0];
  const modifiers = activityEconomy.partyModifiers(user, game);
  if (round.payout > round.wager) party.recordTrustedWin(user.id, round.payout - round.wager, modifiers.party);
  const raidDamage = party.recordTrustedRound(user.id, round.wager, round.payout, modifiers);
  await activityEconomy.recordMissionRound(user, { ...round, weeklyEvents: { ...round.weeklyEvents, raidDamage } });
}

function activityHelmetOptions(env: ServerEnv) {
  if (!env.DISCORD_ACTIVITY_MODE) return undefined;

  return {
    xFrameOptions: false,
    contentSecurityPolicy: {
      directives: {
        "frame-ancestors": [
          "'self'",
          "https://discord.com",
          "https://*.discord.com",
          "https://discordapp.com",
          "https://*.discordapp.com",
          "https://*.discordsays.com"
        ]
      }
    }
  };
}
