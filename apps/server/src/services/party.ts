import type { DiscordUser } from "@iris/shared";

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
  | { type: "feed"; item: PartyFeedItem };

export type PublicPartyPlayer = Omit<PartyPlayer, "lastSeen">;

type PartyRoom = {
  players: Map<string, PartyPlayer>;
  feed: PartyFeedItem[];
  listeners: Set<(message: PartyMessage) => void>;
};

const PRESENCE_TTL_MS = 30_000;

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
    const room: PartyRoom = { players: new Map(), feed: [], listeners: new Set() };
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
  }

  private state(room: PartyRoom) {
    this.prune(room);
    return {
      players: Array.from(room.players.values(), ({ lastSeen: _lastSeen, ...player }) => player),
      crown: 0,
      feed: room.feed
    };
  }

  private broadcastState(room: PartyRoom) {
    this.broadcast(room, { type: "state", ...this.state(room) });
  }

  private broadcast(room: PartyRoom, message: PartyMessage) {
    for (const listener of room.listeners) listener(message);
  }
}
