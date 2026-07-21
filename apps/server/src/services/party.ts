import type { DiscordUser } from "@iris/shared";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";

export type PartyAppearance = {
  level: number;
  game: string;
  glyph: string;
};

type PartyPlayer = PartyAppearance & {
  id: string;
  name: string;
  lastSeen: number;
};

type PartyFeedItem = {
  text: string;
  time: number;
};

type PartyMessage =
  | { type: "state"; players: PublicPartyPlayer[]; crown: number; feed: PartyFeedItem[]; league: PublicLeagueEntry[] }
  | { type: "feed"; item: PartyFeedItem }
  | { type: "crown"; id: string }
  | { type: "league"; league: PublicLeagueEntry[] }
  | { type: "raid"; raid: PublicPartyRaid };

type PartyCrown = {
  id: string;
  recipients: Set<string>;
  createdAt: number;
};

type PartyRaidContributor = { id: string; name: string; glyph: string; damage: number };
type PartyRaid = { id: string; bossId: string; name: string; title: string; icon: string; maxHp: number; hp: number; phase: number; startedAt: number; endsAt: number; defeatedAt: number; contributors: Map<string, PartyRaidContributor>; recipients: Set<string> };
export type PublicPartyRaid = Omit<PartyRaid, "contributors" | "recipients"> & { contributors: PartyRaidContributor[] };

export type PublicPartyPlayer = Omit<PartyPlayer, "lastSeen">;

export type PublicLeagueEntry = {
  id: string;
  name: string;
  glyph: string;
  score: number;
  rounds: number;
  wins: number;
  bestReturn: number;
};

type PartyLeagueEntry = PublicLeagueEntry & {
  updatedAt: number;
};

type PartyRoom = {
  players: Map<string, PartyPlayer>;
  feed: PartyFeedItem[];
  crown: number;
  crowns: Map<string, PartyCrown>;
  leagueWeek: string;
  league: Map<string, PartyLeagueEntry>;
  raid: PartyRaid;
  listeners: Set<(message: PartyMessage) => void>;
};

type StoredPartyRoom = {
  players: PartyPlayer[];
  feed: PartyFeedItem[];
  crown: number;
  crowns: { id: string; recipients: string[]; createdAt: number }[];
  leagueWeek: string;
  league: PartyLeagueEntry[];
  raid: StoredPartyRaid;
};
type StoredPartyRaid = Omit<PartyRaid, "contributors" | "recipients"> & { contributors: PartyRaidContributor[]; recipients: string[] };

type PartyState = { rooms: Record<string, StoredPartyRoom> };

export interface PartyStore {
  load(): PartyState;
  save(state: PartyState): void;
}

export class FilePartyStore implements PartyStore {
  constructor(private readonly path: string) {}

  load(): PartyState {
    try {
      return normalizeState(JSON.parse(readFileSync(this.path, "utf8")) as unknown);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return { rooms: {} };
      throw error;
    }
  }

  save(state: PartyState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf8");
  }
}

const PRESENCE_TTL_MS = 30_000;
const PARTY_CROWN_TTL_MS = 10 * 60_000;

export class PartyService {
  private readonly rooms = new Map<string, PartyRoom>();

  constructor(private readonly options: { store?: PartyStore } = {}) {
    for (const [roomId, room] of Object.entries(options.store?.load().rooms ?? {})) {
      this.rooms.set(roomId, {
        players: new Map(room.players.map((player) => [player.id, player])),
        feed: room.feed,
        crown: room.crown,
        crowns: new Map(room.crowns.map((crown) => [crown.id, { ...crown, recipients: new Set(crown.recipients) }])),
        leagueWeek: room.leagueWeek,
        league: new Map(room.league.map((entry) => [entry.id, entry])),
        raid: hydrateRaid(room.raid),
        listeners: new Set()
      });
    }
  }

  join(user: DiscordUser, roomId: string, appearance: PartyAppearance) {
    const room = this.roomFor(roomId);
    this.upsertPlayer(room, user, appearance);
    this.save();
    this.broadcastState(room);
    return this.state(room);
  }

  presence(user: DiscordUser, roomId: string, appearance: PartyAppearance) {
    const room = this.roomFor(roomId);
    this.upsertPlayer(room, user, appearance);
    this.save();
    this.broadcastState(room);
    return this.state(room);
  }

  publish(user: DiscordUser, roomId: string, kind: "reaction" | "win", payload: { emoji?: string }) {
    const room = this.roomFor(roomId);
    this.prune(room);
    const player = room.players.get(user.id);
    if (!player) return this.state(room);

    const text = kind === "reaction"
      ? `${player.name}: ${payload.emoji || "*"}`
      : `${player.name} completed a table round.`;
    const item = { text, time: Date.now() };
    room.feed.unshift(item);
    room.feed.splice(30);
    this.save();
    this.broadcast(room, { type: "feed", item });
    return this.state(room);
  }

  recordTrustedWin(userId: string, net: number, multiplier = 1) {
    if (!Number.isSafeInteger(net) || net <= 0) return;
    for (const room of this.rooms.values()) {
      this.prune(room);
      if (!room.players.has(userId)) continue;
      room.crown = Math.min(100, room.crown + clamp(Math.floor((Math.floor(net / 2000) + 1) * Math.max(1, multiplier)), 1, 18));
      if (room.crown >= 100) {
        room.crown = 0;
        const crown: PartyCrown = { id: randomUUID(), recipients: new Set(room.players.keys()), createdAt: Date.now() };
        room.crowns.set(crown.id, crown);
        this.addFeed(room, "PARTY CROWN is full. A celebration reward is ready.");
        this.broadcast(room, { type: "crown", id: crown.id });
      }
      this.save();
      this.broadcastState(room);
    }
  }

  recordTrustedRound(userId: string, wager: number, payout: number, modifiers: { raid?: number; masteryLevel?: number } = {}) {
    if (!Number.isSafeInteger(wager) || !Number.isSafeInteger(payout) || wager < 0 || payout < 0) return 0;
    let raidDamage = 0;
    for (const room of this.rooms.values()) {
      this.prune(room);
      const player = room.players.get(userId);
      if (!player) continue;

      this.ensureLeagueWeek(room);
      const entry = room.league.get(userId) ?? {
        id: userId,
        name: player.name,
        glyph: player.glyph,
        score: 0,
        rounds: 0,
        wins: 0,
        bestReturn: 0,
        updatedAt: 0
      };
      const net = Math.max(0, payout - wager);
      entry.name = player.name;
      entry.glyph = player.glyph;
      entry.score = clamp(entry.score + Math.floor(20 + wager / 90 + net / 180), 0, 1_000_000_000);
      entry.rounds = clamp(entry.rounds + 1, 0, 10_000_000);
      entry.wins = clamp(entry.wins + (payout > wager ? 1 : 0), 0, 10_000_000);
      entry.bestReturn = Math.max(entry.bestReturn, payout);
      entry.updatedAt = Date.now();
      room.league.set(userId, entry);
      const raid = this.ensureRaid(room);
      if (raid.hp > 0) {
        const damage = clamp(Math.max(20, Math.floor((wager * .32 + net * .12 + Math.max(1, modifiers.masteryLevel ?? 1) * 8) * Math.max(1, modifiers.raid ?? 1))), 1, 8_000);
        raidDamage += damage;
        raid.hp = Math.max(0, raid.hp - damage);
        raid.phase = raid.hp <= raid.maxHp * .25 ? 3 : raid.hp <= raid.maxHp * .6 ? 2 : 1;
        const contributor = raid.contributors.get(userId) ?? { id: userId, name: player.name, glyph: player.glyph, damage: 0 };
        contributor.name = player.name; contributor.glyph = player.glyph; contributor.damage += damage; raid.contributors.set(userId, contributor);
        if (raid.hp === 0 && !raid.defeatedAt) { raid.defeatedAt = Date.now(); raid.recipients = new Set(raid.contributors.keys()); this.addFeed(room, `${raid.name} was defeated by the party.`); }
        this.broadcast(room, { type: "raid", raid: this.raid(raid) } as PartyMessage);
      }
      this.save();
      this.broadcast(room, { type: "league", league: this.league(room) });
    }
    return raidDamage;
  }

  raidState(userId: string, roomId: string): PublicPartyRaid | null { const room = this.rooms.get(roomId); if (!room || !room.players.has(userId)) return null; return this.raid(this.ensureRaid(room)); }
  canClaimRaid(userId: string, roomId: string, raidId: string): boolean { const room = this.rooms.get(roomId); return Boolean(room?.raid.id === raidId && room.raid.defeatedAt && room.raid.recipients.has(userId)); }

  submitLeague(userId: string, roomId: string): { week: string; league: PublicLeagueEntry[] } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    this.prune(room);
    if (!room.players.has(userId)) return null;
    this.ensureLeagueWeek(room);
    const league = this.league(room);
    this.save();
    return { week: room.leagueWeek, league };
  }

  isMember(userId: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    this.prune(room);
    return room.players.has(userId);
  }

  canClaimCrown(userId: string, roomId: string, crownId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    this.prune(room);
    return room.crowns.get(crownId)?.recipients.has(userId) === true;
  }

  subscribe(roomId: string, userId: string, listener: (message: PartyMessage) => void): (() => void) | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    this.prune(room);
    if (!room.players.has(userId)) return null;
    room.listeners.add(listener);
    return () => room.listeners.delete(listener);
  }

  private roomFor(roomId: string): PartyRoom {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const room: PartyRoom = { players: new Map(), feed: [], crown: 0, crowns: new Map(), leagueWeek: jstWeekKey(), league: new Map(), raid: createRaid(), listeners: new Set() };
    this.rooms.set(roomId, room);
    return room;
  }

  private upsertPlayer(room: PartyRoom, user: DiscordUser, appearance: PartyAppearance) {
    room.players.set(user.id, {
      id: user.id,
      name: user.displayName || user.username,
      level: appearance.level,
      game: appearance.game,
      glyph: appearance.glyph,
      lastSeen: Date.now()
    });
    this.prune(room);
  }

  private prune(room: PartyRoom) {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    for (const [id, player] of room.players) {
      if (player.lastSeen < cutoff) room.players.delete(id);
    }
    const crownCutoff = Date.now() - PARTY_CROWN_TTL_MS;
    for (const [id, crown] of room.crowns) {
      if (crown.createdAt < crownCutoff) room.crowns.delete(id);
    }
  }

  private state(room: PartyRoom) {
    this.prune(room);
    this.ensureLeagueWeek(room);
    return {
      players: Array.from(room.players.values(), ({ lastSeen: _lastSeen, ...player }) => player),
      crown: room.crown,
      feed: room.feed,
      league: this.league(room)
    };
  }

  private league(room: PartyRoom): PublicLeagueEntry[] {
    return Array.from(room.league.values(), ({ updatedAt: _updatedAt, ...entry }) => entry)
      .sort((left, right) => right.score - left.score || right.bestReturn - left.bestReturn || right.wins - left.wins || left.id.localeCompare(right.id));
  }

  private ensureLeagueWeek(room: PartyRoom) {
    const week = jstWeekKey();
    if (room.leagueWeek === week) return;
    room.leagueWeek = week;
    room.league.clear();
  }
  private ensureRaid(room: PartyRoom) { if ((room.raid.defeatedAt && Date.now() - room.raid.defeatedAt > 90_000) || Date.now() > room.raid.endsAt) room.raid = createRaid(room.raid.bossId); return room.raid; }
  private raid(raid: PartyRaid): PublicPartyRaid { return { ...raid, contributors: Array.from(raid.contributors.values()).sort((a,b) => b.damage-a.damage).slice(0,10) }; }

  private broadcastState(room: PartyRoom) {
    this.broadcast(room, { type: "state", ...this.state(room) });
  }

  private broadcast(room: PartyRoom, message: PartyMessage) {
    for (const listener of room.listeners) listener(message);
  }

  private addFeed(room: PartyRoom, text: string) {
    room.feed.unshift({ text, time: Date.now() });
    room.feed.splice(30);
  }

  private save() {
    if (!this.options.store) return;
    const rooms: Record<string, StoredPartyRoom> = {};
    for (const [roomId, room] of this.rooms) {
      rooms[roomId] = {
        players: Array.from(room.players.values()),
        feed: room.feed,
        crown: room.crown,
        crowns: Array.from(room.crowns.values(), (crown) => ({ ...crown, recipients: Array.from(crown.recipients) })),
        leagueWeek: room.leagueWeek,
        league: Array.from(room.league.values())
        ,raid: { ...room.raid, contributors: Array.from(room.raid.contributors.values()), recipients: Array.from(room.raid.recipients) }
      };
    }
    this.options.store.save({ rooms });
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeState(value: unknown): PartyState {
  const raw = value && typeof value === "object" && "rooms" in value ? value as { rooms?: unknown } : {};
  const rooms = raw.rooms && typeof raw.rooms === "object" ? raw.rooms as Record<string, unknown> : {};
  return {
    rooms: Object.fromEntries(Object.entries(rooms).flatMap(([roomId, value]) => {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(roomId) || !value || typeof value !== "object") return [];
      const room = value as Partial<StoredPartyRoom>;
      const players = Array.isArray(room.players) ? room.players.filter(isPartyPlayer) : [];
      const feed = Array.isArray(room.feed) ? room.feed.filter(isFeedItem).slice(0, 30) : [];
      const crowns = Array.isArray(room.crowns) ? room.crowns.flatMap(normalizeCrown).slice(-100) : [];
      const leagueWeek = typeof room.leagueWeek === "string" && /^\d{4}-\d{2}-\d{2}$/.test(room.leagueWeek) ? room.leagueWeek : jstWeekKey();
      const league = Array.isArray(room.league) ? room.league.filter(isLeagueEntry) : [];
      const raid = isStoredRaid(room.raid) ? room.raid : serializeRaid(createRaid());
      return [[roomId, { players, feed, crown: clamp(safeInteger(room.crown), 0, 100), crowns, leagueWeek, league, raid }]];
    }))
  };
}

function isPartyPlayer(value: unknown): value is PartyPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<PartyPlayer>;
  return typeof player.id === "string" && typeof player.name === "string" && typeof player.game === "string" && typeof player.glyph === "string" && Number.isSafeInteger(player.level) && Number.isSafeInteger(player.lastSeen);
}

function isFeedItem(value: unknown): value is PartyFeedItem {
  return Boolean(value && typeof value === "object" && typeof (value as Partial<PartyFeedItem>).text === "string" && Number.isSafeInteger((value as Partial<PartyFeedItem>).time));
}

function normalizeCrown(value: unknown): { id: string; recipients: string[]; createdAt: number }[] {
  if (!value || typeof value !== "object") return [];
  const crown = value as Partial<{ id: string; recipients: unknown; createdAt: number }>;
  const createdAt = crown.createdAt;
  if (typeof crown.id !== "string" || !Array.isArray(crown.recipients) || typeof createdAt !== "number" || !Number.isSafeInteger(createdAt)) return [];
  return [{ id: crown.id, recipients: crown.recipients.filter((id): id is string => typeof id === "string"), createdAt }];
}

function isLeagueEntry(value: unknown): value is PartyLeagueEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PartyLeagueEntry>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.glyph === "string"
    && Number.isSafeInteger(entry.score) && Number.isSafeInteger(entry.rounds) && Number.isSafeInteger(entry.wins)
    && Number.isSafeInteger(entry.bestReturn) && Number.isSafeInteger(entry.updatedAt);
}

function safeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function jstWeekKey(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const mondayOffset = (jst.getUTCDay() + 6) % 7;
  jst.setUTCDate(jst.getUTCDate() - mondayOffset);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}
const RAID_BOSSES = [{id:"leviathan",name:"星喰いリヴァイアサン",title:"CO-OP PALACE RAID",icon:"◈",maxHp:240000},{id:"wyrm",name:"月蝕の古竜",title:"CO-OP PALACE RAID",icon:"♜",maxHp:300000}];
function createRaid(previousBossId?: string): PartyRaid { const index=Math.max(0,RAID_BOSSES.findIndex(x=>x.id===previousBossId)+1)%RAID_BOSSES.length,boss=RAID_BOSSES[index]!; const now=Date.now(); return {id:randomUUID(),bossId:boss.id,name:boss.name,title:boss.title,icon:boss.icon,maxHp:boss.maxHp,hp:boss.maxHp,phase:1,startedAt:now,endsAt:now+45*60_000,defeatedAt:0,contributors:new Map(),recipients:new Set()}; }
function serializeRaid(raid: PartyRaid): StoredPartyRaid { return {...raid,contributors:Array.from(raid.contributors.values()),recipients:Array.from(raid.recipients)}; }
function hydrateRaid(raid: StoredPartyRaid): PartyRaid { return {...raid,contributors:new Map(raid.contributors.map(x=>[x.id,x])),recipients:new Set(raid.recipients)}; }
function isStoredRaid(value: unknown): value is StoredPartyRaid { return Boolean(value && typeof value === "object" && typeof (value as Partial<StoredPartyRaid>).id === "string" && Array.isArray((value as Partial<StoredPartyRaid>).contributors) && Array.isArray((value as Partial<StoredPartyRaid>).recipients)); }
