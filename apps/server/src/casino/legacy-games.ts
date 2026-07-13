import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Game = "holdem" | "tower" | "threecard" | "derby" | "ascent" | "arcana" | "moonshot";
type Phase = "reserving" | "active" | "settling" | "settled";
type Card = { rank: string; suit: "S" | "H" | "D" | "C" };
type Round = { id: string; discordUserId: string; game: Game; bet: number; phase: Phase; payout: number | null; wallet: number | null; state: Record<string, unknown>; lastActionId: string | null };
export interface LegacyGameStore { load(): Round[]; save(rounds: Round[]): void }
export class FileLegacyGameStore implements LegacyGameStore {
  constructor(private readonly path: string) {}
  load(): Round[] { try { const value: unknown = JSON.parse(readFileSync(this.path, "utf8")); if (!Array.isArray(value)) throw new Error("Legacy game state is invalid."); return value as Round[]; } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; } }
  save(rounds: Round[]) { mkdirSync(dirname(this.path), { recursive: true }); writeFileSync(this.path, JSON.stringify(rounds), "utf8"); }
}

export class LegacyGamesService {
  private readonly rounds: Map<string, Round>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: LegacyGameStore }) { this.rounds = new Map(options.store.load().map((round) => [round.id, round])); }
  async reconcileAll() { for (const round of this.rounds.values()) if (round.phase === "reserving" || round.phase === "settling") await this.resume(round); }
  async start(user: DiscordUser, game: Game, id: string, bet: number, extra: Record<string, unknown> = {}) {
    this.validate(game, id, bet); const existing = this.rounds.get(id);
    if (existing) { if (existing.discordUserId !== user.id || existing.game !== game || existing.bet !== bet) throw conflict(); await this.resume(existing); return this.public(existing); }
    const state = initialState(game, extra);
    const round: Round = { id, discordUserId: user.id, game, bet, phase: "reserving", payout: null, wallet: null, state, lastActionId: null };
    this.rounds.set(id, round); this.save(); await this.resume(round); return this.public(round);
  }
  async action(user: DiscordUser, id: string, actionId: string, action: string, extra: Record<string, unknown> = {}) {
    const round = this.require(user, id); if (!valid(actionId)) throw new AppError(400, "bad_request", "Game action is invalid."); await this.resume(round);
    if (round.lastActionId === actionId) return this.public(round);
    if (round.phase !== "active") throw conflict(); round.lastActionId = actionId;
    switch (round.game) {
      case "tower": this.tower(round, action, extra); break;
      case "holdem": await this.holdem(round, action); break;
      case "threecard": await this.threecard(round, action); break;
      case "ascent": this.ascent(round, action); break;
      case "arcana": this.arcana(round, action, extra); break;
      case "moonshot": this.moonshot(round, action); break;
      default: throw new AppError(400, "bad_request", "Game action is invalid.");
    }
    this.save(); await this.resume(round); return this.public(round);
  }
  private async resume(round: Round) {
    if (round.phase === "reserving") {
      const reserved = await reserveCasinoBet({ transactionId: `${round.game}-${round.id}-0`, discordUserId: round.discordUserId, sessionId: `${round.game}-${round.id}`, game: round.game, bet: round.bet }, this.options.env, this.options.fetch);
      round.wallet = reserved.wallet;
      if (round.game === "derby") { const state = round.state as DerbyState; const winner = state.order[0]!; round.payout = state.selection === winner ? Math.floor(round.bet * state.odds[winner]!) : 0; round.phase = "settling"; }
      else round.phase = "active";
      this.save();
    }
    if (round.phase === "settling") {
      const settled = await settleCasinoReservation(`${round.game}-${round.id}-0`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch);
      round.wallet = settled.wallet;
      if (round.game === "holdem" && (round.state as HoldemState).board.length === 5) round.wallet = (await settleCasinoReservation(`holdem-${round.id}-1`, { payout: 0 }, this.options.env, this.options.fetch)).wallet;
      if (round.game === "threecard" && (round.state as ThreeState).dealerEval) round.wallet = (await settleCasinoReservation(`threecard-${round.id}-1`, { payout: 0 }, this.options.env, this.options.fetch)).wallet;
      round.phase = "settled"; this.save();
    }
  }
  private tower(round: Round, action: string, extra: Record<string, unknown>) {
    const s = round.state as TowerState; if (action === "cash") { if (s.floor < 2) throw conflict(); round.payout = Math.floor(round.bet * s.multiplier); round.phase = "settling"; return; }
    const rawDoor = extra.door; if (action !== "door" || !Number.isInteger(rawDoor)) throw new AppError(400, "bad_request", "Tower door is invalid."); const door = rawDoor as number;
    if (door < 0 || door > 3) throw new AppError(400, "bad_request", "Tower door is invalid."); s.revealed = door; if (s.traps.includes(door)) { if (s.ward > 0) { s.ward--; s.traps = traps(); s.revealed = null; return; } round.payout = 0; round.phase = "settling"; return; }
    s.multiplier *= 1.62 + s.floor * .03; if (s.floor >= 10) { round.payout = Math.floor(round.bet * s.multiplier * 1.35); round.phase = "settling"; return; }
    s.floor++; if (s.floor === 4 || s.floor === 7) s.ward = Math.max(s.ward, 1); s.traps = traps(); s.revealed = null;
  }
  private async holdem(round: Round, action: string) {
    const s = round.state as HoldemState; if (action === "fold") { round.payout = 0; round.phase = "settling"; return; } if (action !== "call") throw new AppError(400, "bad_request", "Holdem action is invalid.");
    await reserveCasinoBet({ transactionId: `holdem-${round.id}-1`, discordUserId: round.discordUserId, sessionId: `holdem-${round.id}`, game: "holdem", bet: round.bet * 2 }, this.options.env, this.options.fetch);
    s.board.push(draw(s.deck), draw(s.deck)); const p = score(s.player.concat(s.board)), d = score(s.dealer.concat(s.board)); s.playerRank = p.rank; s.dealerRank = d.rank;
    const dealerQualifies = d.rank >= 1 && (d.rank > 1 || d.tie[0]! >= 4);
    round.payout = p.value > d.value ? Math.floor(round.bet * [5.2, 5.2, 5.2, 5.2, 6, 7, 8, 13, 22][p.rank]!) : p.value === d.value || !dealerQualifies ? round.bet * 3 : 0; round.phase = "settling";
  }
  private async threecard(round: Round, action: string) {
    const s = round.state as ThreeState; const player = score3(s.player), dealer = score3(s.dealer); s.playerEval = player; s.dealerEval = dealer;
    const pair = s.pairPlus ? round.bet * (player.pairPay + 1) : 0;
    if (action === "fold") { round.payout = pair; round.phase = "settling"; return; }
    if (action !== "play") throw new AppError(400, "bad_request", "Three Card action is invalid.");
    await reserveCasinoBet({ transactionId: `threecard-${round.id}-1`, discordUserId: round.discordUserId, sessionId: `threecard-${round.id}`, game: "threecard", bet: round.bet }, this.options.env, this.options.fetch);
    const compare = player.value - dealer.value; let main = !dealer.qualifies ? round.bet * 3 : compare > 0 ? round.bet * 4 : compare === 0 ? round.bet * 2 : 0; main += round.bet * player.anteBonus; round.payout = main + pair; round.phase = "settling";
  }
  private ascent(round: Round, action: string) { const s = round.state as AscentState; if (action !== "cash" && action !== "tick") throw new AppError(400, "bad_request", "Ascent action is invalid."); const multiplier = Math.max(1, Math.exp((Date.now() - s.startedAt) / 7200)); if (s.autoCash > 0 && s.autoCash < s.crashPoint && multiplier >= s.autoCash) { s.multiplier = s.autoCash; round.payout = Math.floor(round.bet * s.autoCash); round.phase = "settling"; return; } s.multiplier = multiplier; if (multiplier >= s.crashPoint) { round.payout = 0; round.phase = "settling"; return; } if (action === "cash") { round.payout = Math.floor(round.bet * multiplier); round.phase = "settling"; } }
  private arcana(round: Round, action: string, extra: Record<string, unknown>) { const s = round.state as ArcanaState; if (action === "begin") { if (s.startedAt !== null) throw conflict(); s.startedAt = Date.now(); return; } if (s.startedAt === null) throw conflict(); if (action === "timeout") { if (Date.now() - s.startedAt < 45000) throw conflict(); round.payout = 0; round.phase = "settling"; return; } const rawIndex = extra.index; if (action !== "flip" || !Number.isInteger(rawIndex)) throw new AppError(400, "bad_request", "Arcana card is invalid."); const index = rawIndex as number; if (index < 0 || index > 15) throw new AppError(400, "bad_request", "Arcana card is invalid."); if (Date.now() - s.startedAt > 45000) { round.payout = 0; round.phase = "settling"; return; } if (s.open.includes(index) || s.matched.includes(index)) throw conflict(); s.open.push(index); if (s.open.length < 2) return; s.moves++; const a=s.open[0]!,b=s.open[1]!; if (s.cards[a] === s.cards[b]) { s.matched.push(a,b); s.open = []; if (s.matched.length === 16) { const time = Math.max(0, 45 - (Date.now() - s.startedAt) / 1000), m = Math.min(.95, Math.max(.4, .4 + time / 45 * .3 + Math.max(0, Math.min(1, (28 - s.moves) / 20)) * .25)); round.payout = Math.floor(round.bet * m); round.phase = "settling"; } } else s.open = []; }
  private moonshot(round: Round, action: string) { const s = round.state as MoonshotState; if (action !== "throw") throw new AppError(400, "bad_request", "Moonshot action is invalid."); const t = (Date.now() - s.startedAt) / 1000, angle = t * 2.1 + Math.sin(t * .73) * .8, radius = .1 + Math.abs(Math.sin(t * 1.47 + s.scores.length * .9)) * .78; s.scores.push(Math.max(0, Math.min(100, Math.round(105 - radius * 112 + (Math.cos(angle * 3) + 1) * 3.5)))); s.startedAt = Date.now(); if (s.scores.length === 3) { const total = s.scores.reduce((a,b) => a+b, 0), mult = total >= 270 ? .95 : total >= 225 ? .75 : total >= 180 ? .5 : total >= 135 ? .25 : 0; round.payout = Math.floor(round.bet * mult); round.phase = "settling"; } }
  public public(round: Round) {
    const state = { ...round.state } as Record<string, unknown>;
    if (round.game === "tower" && round.phase === "active") state.traps = [];
    if (round.game === "ascent" && round.phase === "active") delete state.crashPoint;
    if (round.game === "holdem" || round.game === "threecard") delete state.deck;
    if (round.game === "holdem" && round.phase === "active") state.dealer = hiddenCards(2);
    if (round.game === "threecard" && round.phase === "active") state.dealer = hiddenCards(3);
    return { ...round, state, serverNow: Date.now() };
  }
  private require(user: DiscordUser, id: string) { const round = this.rounds.get(id); if (!round || round.discordUserId !== user.id) throw new AppError(404, "casino_transaction_not_found", "Game round was not found."); return round; }
  private validate(game: Game, id: string, bet: number) { if (!valid(id) || ![100,500,1000,2500,5000].includes(bet) || !["holdem","tower","threecard","derby","ascent","arcana","moonshot"].includes(game)) throw new AppError(400, "bad_request", "Game round is invalid."); }
  private save() { this.options.store.save([...this.rounds.values()]); }
}

type TowerState = { floor:number; multiplier:number; traps:number[]; ward:number; revealed:number | null };
type HoldemState = { deck:Card[]; player:Card[]; dealer:Card[]; board:Card[]; playerRank:number|null; dealerRank:number|null };
type ThreeState = { deck:Card[]; player:Card[]; dealer:Card[]; pairPlus:boolean; playerEval:unknown; dealerEval:unknown };
type DerbyState = { selection:number; form:number[]; odds:number[]; order:number[] };
type AscentState = { startedAt:number; crashPoint:number; multiplier:number; autoCash:number };
type ArcanaState = { cards:string[]; open:number[]; matched:number[]; moves:number; startedAt:number | null };
type MoonshotState = { scores:number[]; startedAt:number };
function initialState(game: Game, extra: Record<string, unknown>): Record<string, unknown> {
  if (game === "tower") return { floor:1, multiplier:1, traps:traps(), ward:0, revealed:null } satisfies TowerState;
  if (game === "holdem") { const deck = cards(); return { deck, player:[draw(deck),draw(deck)], dealer:[draw(deck),draw(deck)], board:[draw(deck),draw(deck),draw(deck)], playerRank:null, dealerRank:null } satisfies HoldemState; }
  if (game === "threecard") { const deck = cards(), player=[draw(deck),draw(deck),draw(deck)]; return { deck, player, dealer:[draw(deck),draw(deck),draw(deck)], pairPlus: extra.pairPlus === true, playerEval:score3(player), dealerEval:null } satisfies ThreeState; }
  if (game === "derby") { const rawSelection = extra.selection; if (!Number.isInteger(rawSelection)) throw new AppError(400,"bad_request","Derby selection is invalid."); const selection=rawSelection as number; if(selection<0||selection>5)throw new AppError(400,"bad_request","Derby selection is invalid."); const weights=[1.34,1.18,1.05,.92,.79,.66], form=weights.map(()=>.72+randomInt(0,560)/1000), raw=weights.map((w,i)=>w*form[i]!), sum=raw.reduce((a,b)=>a+b,0), odds=raw.map(x=>Math.max(1.6,Math.min(12,Math.floor(.92/(x/sum)*10)/10))), order=raw.map((x,index)=>({index,time:-Math.log(Math.max(.000001,randomInt(1,1_000_000)/1_000_000))/x})).sort((a,b)=>a.time-b.time).map(x=>x.index); return { selection,form,odds,order } satisfies DerbyState; }
  if (game === "ascent") { const rawAuto = extra.auto; const autoCash = rawAuto === undefined ? 0 : rawAuto; if (typeof autoCash !== "number" || ![0,1.5,2,3,5,10].includes(autoCash)) throw new AppError(400, "bad_request", "Ascent auto cash-out is invalid."); const u=Math.max(.000001,randomInt(1,1_000_000)/1_000_000); return { startedAt:Date.now(), crashPoint:Math.max(1,Math.min(100,Math.floor(.99/(1-u)*100)/100)), multiplier:1, autoCash } satisfies AscentState; }
  if (game === "arcana") return { cards:shuffle(["moon","star","rose","diamond","crown","wild","sun","eye"].flatMap(x=>[x,x])),open:[],matched:[],moves:0,startedAt:null } satisfies ArcanaState;
  return { scores:[],startedAt:Date.now() } satisfies MoonshotState;
}
function cards(): Card[] { const result:Card[]=[]; for (const suit of ["S","H","D","C"] as const) for (const rank of ["2","3","4","5","6","7","8","9","10","J","Q","K","A"]) result.push({rank,suit}); return shuffle(result); }
function draw(deck: Card[]) { const card=deck.pop(); if (!card) throw new AppError(500,"internal_error","Card shoe exhausted."); return card; }
function score(cards:Card[]) { let best={rank:-1,value:-1,tie:[] as number[]}; for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const next=scoreFive([cards[a]!,cards[b]!,cards[c]!,cards[d]!,cards[e]!]);if(next.value>best.value)best=next;} return best; }
function scoreFive(cards:Card[]) { const values=cards.map(c=>value(c.rank)).sort((a,b)=>b-a), counts=new Map<number,number>(); values.forEach(v=>counts.set(v,(counts.get(v)??0)+1)); const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]); const flush=new Set(cards.map(c=>c.suit)).size===1, unique=[...new Set(values)], wheel=unique.join(",")==="14,5,4,3,2", straight=unique.length===5&&(wheel||unique.every((v,i)=>i===0||unique[i-1]! === v+1)), straightHigh=wheel?5:unique[0]!, lead=groups[0]!; let rank=0, tie:number[]=[]; if(flush&&straight){rank=8;tie=[straightHigh]}else if(lead[1]===4){rank=7;tie=[lead[0],groups[1]![0]]}else if(lead[1]===3&&groups[1]![1]===2){rank=6;tie=[lead[0],groups[1]![0]]}else if(flush){rank=5;tie=values}else if(straight){rank=4;tie=[straightHigh]}else if(lead[1]===3){rank=3;tie=[lead[0],...groups.slice(1).map(x=>x[0])]}else if(lead[1]===2&&groups[1]![1]===2){rank=2;tie=[Math.max(lead[0],groups[1]![0]),Math.min(lead[0],groups[1]![0]),groups[2]![0]]}else if(lead[1]===2){rank=1;tie=[lead[0],...groups.slice(1).map(x=>x[0])]}else tie=values; return {rank,tie,value:rank*1_000_000+tie.reduce((n,v,i)=>n+v*Math.pow(15,4-i),0)}; }
function score3(cards:Card[]) { const values=cards.map(c=>value(c.rank)).sort((a,b)=>b-a), counts=[...new Set(values)].length, flush=new Set(cards.map(c=>c.suit)).size===1, straight=counts===3&&((values[0]! - values[2]! ===2)||values.join(",")==="14,3,2"); const rank=straight&&flush?6:counts===1?5:straight?4:flush?3:counts===2?2:1, pairPay=[0,0,1,3,6,30,40][rank]!, anteBonus=[0,0,0,0,1,4,5][rank]!; return {rank,name:["","HIGH CARD","PAIR","FLUSH","STRAIGHT","THREE OF A KIND","STRAIGHT FLUSH"][rank]!,value:rank*100+values.reduce((n,v,i)=>n+v*Math.pow(15,2-i),0),pairPay,anteBonus,qualifies:rank>1||values[0]! >= 12}; }
function value(rank:string){return rank==="A"?14:rank==="K"?13:rank==="Q"?12:rank==="J"?11:Number(rank)}
function hiddenCards(count:number):Card[]{return Array.from({length:count},()=>({rank:"A",suit:"S"}))} function traps(){return shuffle([0,1,2,3]).slice(0,2)} function shuffle<T>(items:T[]){for(let i=items.length-1;i>0;i--){const j=randomInt(i+1);[items[i],items[j]]=[items[j]!,items[i]!]}return items} function valid(v:string){return /^[A-Za-z0-9:_.-]{1,128}$/.test(v)} function conflict(){return new AppError(409,"casino_transaction_conflict","Game round cannot accept that action.");}
