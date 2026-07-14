import type { DiscordUser } from "@iris/shared";
import { randomUUID } from "node:crypto";

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
  | { type: "state"; players: PublicPartyPlayer[]; crown: number; feed: PartyFeedItem[] }
  | { type: "feed"; item: PartyFeedItem }
  | { type: "crown"; id: string };

type PartyCrown = {
  id: string;
  recipients: Set<string>;
  createdAt: number;
};

export type PublicPartyPlayer = Omit<PartyPlayer, "lastSeen">;

type PartyRoom = {
  players: Map<string, PartyPlayer>;
  feed: PartyFeedItem[];
  crown: number;
  crowns: Map<string, PartyCrown>;
  listeners: Set<(message: PartyMessage) => void>;
};

const PRESENCE_TTL_MS = 30_000;
const PARTY_CROWN_TTL_MS = 10 * 60_000;

export class PartyService {
  private readonly rooms = new Map<string, PartyRoom>();

  join(user: DiscordUser, roomId: string, appearance: PartyAppearance) {
    const room = this.roomFor(roomId);
    this.upsertPlayer(room, user, appearance);
    this.broadcastState(room);
    return this.state(room);
  }

  presence(user: DiscordUser, roomId: string, appearance: PartyAppearance) {
    const room = this.roomFor(roomId);
    this.upsertPlayer(room, user, appearance);
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
    this.broadcast(room, { type: "feed", item });
    return this.state(room);
  }

  recordTrustedWin(userId: string, net: number) {
    if (!Number.isSafeInteger(net) || net <= 0) return;
    for (const room of this.rooms.values()) {
      this.prune(room);
      if (!room.players.has(userId)) continue;
      room.crown = Math.min(100, room.crown + clamp(Math.floor(net / 2000) + 1, 1, 18));
      if (room.crown >= 100) {
        room.crown = 0;
        const crown: PartyCrown = { id: randomUUID(), recipients: new Set(room.players.keys()), createdAt: Date.now() };
        room.crowns.set(crown.id, crown);
        this.addFeed(room, "PARTY CROWN is full. A celebration reward is ready.");
        this.broadcast(room, { type: "crown", id: crown.id });
      }
      this.broadcastState(room);
    }
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
    const room: PartyRoom = { players: new Map(), feed: [], crown: 0, crowns: new Map(), listeners: new Set() };
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
    return {
      players: Array.from(room.players.values(), ({ lastSeen: _lastSeen, ...player }) => player),
      crown: room.crown,
      feed: room.feed
    };
  }

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
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
