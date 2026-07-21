(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.CasinoApp) return;

  function setWallet(wallet) {
    window.__IRIS_SET_WALLET?.(wallet);
  }

  async function post(path, body) {
    const response = await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Game is unavailable.");
    return payload;
  }

  function serverClockStart(round) {
    const startedAt = Number(round?.state?.startedAt);
    const serverNow = Number(round?.serverNow);
    if (!Number.isFinite(startedAt) || !Number.isFinite(serverNow)) return performance.now();
    return performance.now() - Math.max(0, serverNow - startedAt);
  }

  function recordRemote(game, key, wager, payout, label, detail = "", events = [], score = 0) {
    const app = window.__LUX_NOCTIS__;
    if (!app || !key) return;
    app.irisRecordedRounds ??= new Set();
    const id = `${game}:${key}`;
    if (app.irisRecordedRounds.has(id)) return;
    app.irisRecordedRounds.add(id);
    app.recordRound({ game, wager, payout, label, detail, events, score, remote: true });
  }
  window.__IRIS_RECORD_REMOTE__ = recordRemote;

  function patchDragon(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    game.deal = async function () {
      if (this.busy) return;
      this.busy = true;
      this.dragon = null;
      this.tiger = null;
      this.status = "DEALING FROM THE IRIS SHOE";
      this.render();
      try {
        const request = window.__IRIS_ACTIVITY_REQUESTS__.begin("dragon", () => ({ id: crypto.randomUUID(), selection: this.selection, bet: this.bet }));
        const round = (await post("/api/games/dragon/rounds", { roundId: request.id, selection: request.selection, bet: request.bet })).round;
        await core.wait(this.app.profile.data.settings.reducedMotion ? 30 : 320);
        this.dragon = round.dragon;
        this.app.audio.play("card");
        this.render();
        await core.wait(this.app.profile.data.settings.reducedMotion ? 30 : 420);
        this.tiger = round.tiger;
        this.app.audio.play("card");
        this.status = round.outcome === "suited" ? "SUITED TIE" : round.outcome === "tie" ? "TIE" : round.outcome === "dragon" ? "DRAGON WINS" : "TIGER WINS";
        recordRemote("dragon", round.roundId, this.bet, round.payout || 0, "DRAGON & TIGER", this.status);
        setWallet(round.wallet);
        window.__IRIS_ACTIVITY_REQUESTS__.complete("dragon", request.id);
      } catch (error) {
        this.status = "DRAGON TABLE UNAVAILABLE";
        this.app.toast("DRAGON UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
      } finally {
        this.busy = false;
        this.render();
      }
    };
  }

  function patchWheel(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    game.spin = async function () {
      if (this.busy) return;
      this.busy = true;
      this.result = null;
      this.render();
      this.app.audio.play("spin");
      try {
        const request = window.__IRIS_ACTIVITY_REQUESTS__.begin("wheel", () => ({ id: crypto.randomUUID(), bet: this.bet }));
        const spin = (await post("/api/games/wheel/spins", { spinId: request.id, bet: request.bet })).spin;
        const index = spin.index;
        const segments = 24;
        const step = 360 / segments;
        const center = index * step;
        const current = ((this.rotation % 360) + 360) % 360;
        const target = 360 - center;
        this.rotation += ((target - current + 360) % 360) + (this.app.profile.data.settings.reducedMotion ? 360 : 2160);
        const wheel = this.root.querySelector("#fortuneWheel");
        wheel.style.transitionDuration = this.app.profile.data.settings.reducedMotion ? ".35s" : "4.2s";
        wheel.style.transform = `rotate(${this.rotation}deg)`;
        await core.wait(this.app.profile.data.settings.reducedMotion ? 380 : 4300);
        this.result = { mult: spin.multiplier, label: spin.multiplier ? `x${spin.multiplier}` : "MISS" };
        this.app.audio.play(spin.multiplier >= 3 ? "bigwin" : spin.multiplier ? "win" : "lose");
        recordRemote("wheel", spin.spinId, this.bet, spin.payout || 0, "FORTUNE CONSTELLATION", this.result.label);
        setWallet(spin.wallet);
        window.__IRIS_ACTIVITY_REQUESTS__.complete("wheel", request.id);
      } catch (error) {
        this.app.toast("FORTUNE WHEEL UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
      } finally {
        this.busy = false;
        this.render();
      }
    };
  }

  function patchCraps(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    game.remoteRoundId = null;
    game.roll = async function () {
      if (this.busy) return;
      this.busy = true;
      this.message = "THE MOONSTONE DICE ARE ROLLING";
      this.render();
      try {
        this.irisCrapsStartId ??= crypto.randomUUID(); this.irisCrapsStartSelection ??= this.selection; this.irisCrapsStartBet ??= this.bet;
        this.irisCrapsRollActionId ??= crypto.randomUUID();
        const payload = this.remoteRoundId
          ? await post(`/api/games/craps/rounds/${encodeURIComponent(this.remoteRoundId)}/roll`, { actionId: this.irisCrapsRollActionId })
          : await post("/api/games/craps/rounds", { roundId: this.irisCrapsStartId, selection: this.irisCrapsStartSelection, bet: this.irisCrapsStartBet });
        const round = payload.round;
        this.irisCrapsStartId = null; this.irisCrapsStartSelection = null; this.irisCrapsStartBet = null;
        this.irisCrapsRollActionId = null;
        this.remoteRoundId = round.roundId;
        const delay = this.app.profile.data.settings.reducedMotion ? 80 : 520;
        const ticker = this.setInterval(() => { this.dice = [1 + core.randomInt(6), 1 + core.randomInt(6)]; this.renderDice(); }, 65);
        await core.wait(delay);
        clearInterval(ticker);
        this.dice = round.dice;
        this.lastSum = round.dice[0] + round.dice[1];
        this.point = round.point;
        this.pendingWager = round.phase === "active" ? round.bet : 0;
        this.message = round.message;
        this.app.audio.play("stop");
        setWallet(round.wallet);
        if (round.phase === "settled") { recordRemote("craps", round.roundId, round.bet, round.payout || 0, "MOONSTONE CRAPS", round.message); this.remoteRoundId = null; }
      } catch (error) {
        this.message = "CRAPS TABLE UNAVAILABLE";
        this.app.toast("CRAPS UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
      } finally {
        this.busy = false;
        this.render();
      }
    };
  }

  function patchPlinko(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    game.drop = async function () {
      if (this.busy) return;
      this.busy = true;
      this.render();
      this.app.audio.play("spin");
      try {
        const request = window.__IRIS_ACTIVITY_REQUESTS__.begin("plinko", () => ({ id: crypto.randomUUID(), bet: this.bet, risk: this.risk }));
        const drop = (await post("/api/games/plinko/drops", { dropId: request.id, bet: request.bet, risk: request.risk })).drop;
        const path = this.pathFor(drop.choices);
        const duration = this.app.profile.data.settings.reducedMotion ? 420 : 2400;
        const start = performance.now();
        await new Promise((resolve) => {
          const animate = (now) => {
            const t = Math.min(1, (now - start) / duration), segments = path.points.length - 1, progress = t * segments, index = Math.min(segments - 1, Math.floor(progress)), local = progress - index, a = path.points[index], b = path.points[index + 1], ease = local < .5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
            this.ball = { x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * local };
            this.draw();
            if (t < 1) requestAnimationFrame(animate); else resolve();
          };
          requestAnimationFrame(animate);
        });
        this.ball = null;
        this.draw();
        this.app.audio.play(drop.multiplier >= 3 ? "bigwin" : drop.multiplier >= 1 ? "win" : "lose");
        this.root.querySelector("#plinkoStatus").textContent = `POCKET x${drop.multiplier}  ${core.formatL(drop.payout)}`;
        recordRemote("plinko", drop.dropId, this.bet, drop.payout || 0, "STARFALL PLINKO", `x${drop.multiplier}`);
        setWallet(drop.wallet);
        window.__IRIS_ACTIVITY_REQUESTS__.complete("plinko", request.id);
      } catch (error) {
        this.app.toast("PLINKO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
      } finally {
        this.busy = false;
        this.render();
      }
    };
  }

  function patchHiLo(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    const apply = (round) => {
      game.remoteRoundId = round.roundId;
      game.current = round.current;
      game.multiplier = round.multiplier;
      game.correct = round.correct;
      game.history = round.history;
      game.remoteWallet = round.wallet;
    };
    const resetAfterResult = () => {
      game.clearReset();
      game.resetTimer = game.setTimeout(() => {
        game.current = null; game.pending = null; game.multiplier = 1; game.correct = 0; game.history = []; game.status = "BET AND START"; game.phase = "idle"; game.remoteRoundId = null; game.render();
      }, game.app.profile.data.settings.reducedMotion ? 650 : 1900);
    };
    game.start = async function () {
      if (this.phase !== "idle" || this.busy) return;
      this.busy = true; this.status = "DEALING FROM THE IRIS SHOE"; this.render();
      try {
        this.irisHiLoStartId ??= crypto.randomUUID(); this.irisHiLoStartBet ??= this.bet;
        const round = (await post("/api/games/hilo/rounds", { roundId: this.irisHiLoStartId, bet: this.irisHiLoStartBet })).round;
        this.irisHiLoStartId = null; this.irisHiLoStartBet = null;
        apply(round); this.phase = "active"; this.status = "CHOOSE THE NEXT CARD"; this.app.audio.play("card"); setWallet(round.wallet);
      } catch (error) { this.app.toast("HI-LO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    game.guess = async function (direction) {
      if (this.phase !== "active" || this.busy || !this.remoteRoundId || (this.irisHiLoActionDirection && this.irisHiLoActionDirection !== direction)) return;
      this.busy = true; this.phase = "revealing"; this.status = `${direction.toUpperCase()} LOCKED`; this.render();
      try {
        this.irisHiLoActionId ??= crypto.randomUUID(); this.irisHiLoActionDirection ??= direction;
        const round = (await post(`/api/games/hilo/rounds/${encodeURIComponent(this.remoteRoundId)}/guess`, { actionId: this.irisHiLoActionId, direction })).round;
        this.irisHiLoActionId = null; this.irisHiLoActionDirection = null;
        await core.wait(this.app.profile.data.settings.reducedMotion ? 45 : 330);
        apply(round); setWallet(round.wallet);
        if (round.phase === "settled") { this.phase = "result"; this.status = round.payout ? `${round.correct} CARD STREAK` : "STREAK LOST"; recordRemote("hilo",round.roundId,this.bet,round.payout||0,"MIDNIGHT HI-LO",this.status); resetAfterResult(); }
        else { this.phase = "active"; this.status = `CORRECT ${round.correct}  x${round.multiplier.toFixed(2)}`; this.app.audio.play("win"); }
      } catch (error) { this.phase = "active"; this.app.toast("HI-LO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    game.cash = async function () {
      if (this.phase !== "active" || this.busy || !this.correct || !this.remoteRoundId || this.irisHiLoActionDirection) return;
      this.busy = true;
      try {
        this.irisHiLoActionId ??= crypto.randomUUID();
        const round = (await post(`/api/games/hilo/rounds/${encodeURIComponent(this.remoteRoundId)}/cash`, { actionId: this.irisHiLoActionId })).round;
        this.irisHiLoActionId = null;
        apply(round); this.phase = "result"; this.status = `${round.correct} CARD STREAK`; recordRemote("hilo",round.roundId,this.bet,round.payout||0,"MIDNIGHT HI-LO",this.status); setWallet(round.wallet); resetAfterResult();
      } catch (error) { this.app.toast("HI-LO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
  }

  function patchMines(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    const apply = (round) => {
      game.remoteRoundId = round.roundId; game.bet = round.bet; game.mineCount = round.mineCount; game.revealed = new Set(round.revealed); game.multiplier = round.multiplier;
      game.mines = new Set(round.mines || []); game.showMines = Boolean(round.mines); game.remoteWallet = round.wallet;
      game.phase = round.phase === "active" ? "active" : round.hit ? "lost" : "cashed";
    };
    const normalizeActiveRound = (round) => {
      if (!round || (round.game && round.game !== "mines")) return null;
      const state = round.state && typeof round.state === "object" ? round.state : round;
      const roundId = round.roundId || state.roundId || round.id;
      if (!roundId || round.phase !== "active") return null;
      return { ...state, roundId, phase: round.phase, wallet: round.wallet ?? state.wallet, mines: null };
    };
    const activeRoundKey = (round) => JSON.stringify([round.roundId, round.phase, round.bet, round.mineCount, round.revealed, round.multiplier, round.wallet]);
    const applyActiveRound = (round) => {
      const active = normalizeActiveRound(round);
      if (!active) return false;
      const key = activeRoundKey(active);
      if (game.irisMinesActiveRoundKey === key && game.remoteRoundId === active.roundId && game.phase === "active") return true;
      apply(active); game.status = `ROUND RESTORED ${active.revealed.length}  x${active.multiplier.toFixed(2)}`; game.irisMinesActiveRoundKey = key;
      game.render(); return true;
    };
    const waitForScope = async () => {
      const requests = window.__IRIS_ACTIVITY_REQUESTS__;
      if (requests?.waitForUserScope) await requests.waitForUserScope();
    };
    const restoreMinesRound = async (eventRound = null) => {
      if (eventRound) {
        try { await waitForScope(); return applyActiveRound(eventRound); } catch { return false; }
      }
      if (game.irisMinesRestorePromise) return game.irisMinesRestorePromise;
      game.irisMinesRestorePromise = (async () => {
        try {
          await waitForScope();
          const cached = window.__IRIS_ACTIVE_ROUNDS__?.find((round) => round.game === "mines" && round.phase === "active");
          if (cached && applyActiveRound(cached)) return true;
          const response = await fetch("/api/games/mines/active-round", { credentials: "include", cache: "no-store" });
          if (!response.ok) return false;
          const payload = await response.json().catch(() => null);
          return applyActiveRound(payload?.round);
        } catch { return false; }
        finally { game.irisMinesRestorePromise = null; }
      })();
      return game.irisMinesRestorePromise;
    };
    game.irisRestoreMinesRound = restoreMinesRound;
    window.addEventListener("iris-active-round", (event) => {
      if (window.__LUX_NOCTIS__?.gameInstance !== game) return;
      void restoreMinesRound(event.detail);
    });
    window.addEventListener("iris-user-scope-ready", () => {
      if (window.__LUX_NOCTIS__?.gameInstance !== game) return;
      void restoreMinesRound();
    });
    const resetAfterResult = () => {
      game.clearReset(); game.resetTimer = game.setTimeout(() => { game.phase = "idle"; game.revealed.clear(); game.mines.clear(); game.multiplier = 1; game.status = "SELECT BET AND MINES"; game.showMines = false; game.remoteRoundId = null; game.render(); }, game.app.profile.data.settings.reducedMotion ? 650 : 1900);
    };
    game.start = async function () {
      if (this.phase !== "idle") return;
      this.clearReset(); this.status = "SEALING THE IRIS GRID"; this.render();
      try { this.irisMinesStartId ??= crypto.randomUUID(); this.irisMinesStartBet ??= this.bet; this.irisMinesStartCount ??= this.mineCount; const round = (await post("/api/games/mines/rounds", { roundId: this.irisMinesStartId, bet: this.irisMinesStartBet, mineCount: this.irisMinesStartCount })).round; this.irisMinesStartId = null; this.irisMinesStartBet = null; this.irisMinesStartCount = null; apply(round); this.status = "ROUND LIVE"; this.app.audio.play("chime"); setWallet(round.wallet); }
      catch (error) { this.app.toast("MINES UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.render(); }
    };
    game.reveal = async function (index) {
      if (this.phase !== "active" || this.revealed.has(index) || this.busy || (this.irisMinesActionType && (this.irisMinesActionType !== "reveal" || this.irisMinesActionIndex !== index))) return;
      this.busy = true;
      try { this.irisMinesActionId ??= crypto.randomUUID(); this.irisMinesActionType ??= "reveal"; this.irisMinesActionIndex ??= index; const round = (await post(`/api/games/mines/rounds/${encodeURIComponent(this.remoteRoundId)}/reveal`, { actionId: this.irisMinesActionId, index })).round; this.irisMinesActionId = null; this.irisMinesActionType = null; this.irisMinesActionIndex = null; apply(round); this.status = round.phase === "active" ? `SAFE ${round.revealed.length}  x${round.multiplier.toFixed(2)}` : round.hit ? "MINE DETONATED" : "ABYSSAL CASH OUT"; this.app.audio.play(round.hit ? "lose" : "chip"); setWallet(round.wallet); if (round.phase === "settled") { recordRemote("mines",round.roundId,this.bet,round.payout||0,"ABYSSAL MINES",this.status); resetAfterResult(); } }
      catch (error) { this.app.toast("MINES UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    game.cashOut = async function () {
      if (this.phase !== "active" || !this.revealed.size || this.busy || this.irisMinesActionType) return;
      this.busy = true;
      try { this.irisMinesActionId ??= crypto.randomUUID(); this.irisMinesActionType ??= "cash"; const round = (await post(`/api/games/mines/rounds/${encodeURIComponent(this.remoteRoundId)}/cash`, { actionId: this.irisMinesActionId })).round; this.irisMinesActionId = null; this.irisMinesActionType = null; apply(round); this.status = "ABYSSAL CASH OUT"; recordRemote("mines",round.roundId,this.bet,round.payout||0,"ABYSSAL MINES",this.status); this.app.audio.play("win"); setWallet(round.wallet); resetAfterResult(); }
      catch (error) { this.app.toast("MINES UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    void restoreMinesRound();
  }

  function patchWar(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    const apply = (round) => { game.remoteRoundId = round.roundId; game.player = round.player; game.dealer = round.dealer; game.warPlayer = round.warPlayer; game.warDealer = round.warDealer; game.phase = round.phase === "tie" ? "tie" : round.phase === "settled" ? "result" : "dealing"; game.status = round.label || "DEALING"; setWallet(round.wallet); };
    game.deal = async function () {
      if (this.busy || this.phase !== "betting") return;
      this.busy = true; this.status = "DEALING FROM THE IRIS SHOE"; this.render();
      try { this.irisWarStartId ??= crypto.randomUUID(); this.irisWarStartBet ??= this.bet; const round = (await post("/api/games/war/rounds", { roundId: this.irisWarStartId, bet: this.irisWarStartBet })).round; this.irisWarStartId = null; this.irisWarStartBet = null; await core.wait(this.app.profile.data.settings.reducedMotion ? 30 : 280); apply(round); if(round.phase==="settled")recordRemote("war",round.roundId,this.bet,round.payout||0,round.label||"CROWN WAR",`${round.player?.rank||"?"} VS ${round.dealer?.rank||"?"}`); this.app.audio.play("card"); }
      catch (error) { this.app.toast("WAR UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    const act = async function (action) {
      if (this.phase !== "tie" || this.busy || !this.remoteRoundId || (this.irisWarAction && this.irisWarAction !== action)) return;
      this.busy = true;
      try { this.irisWarActionId ??= crypto.randomUUID(); this.irisWarAction ??= action; const round = (await post(`/api/games/war/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, { actionId: this.irisWarActionId, action })).round; this.irisWarActionId = null; this.irisWarAction = null; apply(round); recordRemote("war",round.roundId,this.bet*(round.wentToWar?2:1),round.payout||0,round.label||"CROWN WAR",`${round.player?.rank||"?"} VS ${round.dealer?.rank||"?"}`); this.app.audio.play(round.payout ? "win" : "lose"); }
      catch (error) { this.app.toast("WAR UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
    game.surrender = function () { return act.call(this, "surrender"); };
    game.goWar = function () { return act.call(this, "war"); };
  }

  function patchBingo(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    game.play = async function () {
      if (this.busy) return;
      this.busy = true; this.status = "THE ORACLE IS DRAWING"; this.draws = []; this.marked = new Set(["2-2"]); this.lines = []; this.render();
      try {
        const request = window.__IRIS_ACTIVITY_REQUESTS__.begin("bingo", () => ({ id: crypto.randomUUID(), bet: this.bet }));
        const draw = (await post("/api/games/bingo/draws", { drawId: request.id, bet: request.bet })).draw;
        this.card = draw.card;
        for (const number of draw.draws) { await core.wait(this.app.profile.data.settings.reducedMotion ? 20 : 115); this.draws.push(number); this.mark(number); this.app.audio.play("stop"); this.render(); }
        this.lines = draw.lines; this.status = draw.lines.length ? `BINGO! ${draw.lines.length} LINE` : "NO BINGO"; recordRemote("bingo",draw.drawId,this.bet,draw.payout||0,draw.lines.length?"LUNAR BINGO":"BINGO NIGHT",`${draw.lines.length} LINES`,draw.lines.length?[{event:"bingo"}]:[]); setWallet(draw.wallet); window.__IRIS_ACTIVITY_REQUESTS__.complete("bingo", request.id);
      } catch (error) { this.app.toast("BINGO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      finally { this.busy = false; this.render(); }
    };
  }

  function patchScratch(game) {
    if (game.irisEconomyPatched) return;
    game.irisEconomyPatched = true;
    const symbols = {
      blank: { id: "blank", icon: "-", name: "ASH" }, moon: { id: "moon", icon: "M", name: "MOON" }, star: { id: "star", icon: "S", name: "STAR" }, rose: { id: "rose", icon: "R", name: "ROSE" }, diamond: { id: "diamond", icon: "D", name: "DIAMOND" }, crown: { id: "crown", icon: "C", name: "CROWN" }, wild: { id: "wild", icon: "W", name: "WILD" }
    };
    game.issue = async function () {
      if (this.active) return;
      try {
        this.irisScratchStartId ??= crypto.randomUUID();
        const ticket = (await post("/api/games/scratch/tickets", { ticketId: this.irisScratchStartId, bet: this.bet })).ticket;
        this.irisScratchStartId = null;
        this.remoteTicketId = ticket.ticketId; this.remoteScratchReveals = new Set(); this.active = true; this.resolved = false; this.revealed.clear(); this.strokes = []; this.symbols = ticket.symbols.map(() => null); this.status = "SCRATCH THE IRIS TICKET"; this.resize(true); setWallet(ticket.wallet); this.renderUi();
      } catch (error) { this.app.toast("SCRATCH UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
    };
    game.resolve = async function () {
      if (this.resolved || !this.remoteTicketId) return;
      this.resolved = true;
      try {
        this.irisScratchActionId ??= crypto.randomUUID();
        const ticket = (await post(`/api/games/scratch/tickets/${encodeURIComponent(this.remoteTicketId)}/reveal-all`, { actionId: this.irisScratchActionId })).ticket;
        this.irisScratchActionId = null;
        this.symbols = ticket.symbols.map((id) => symbols[id]); this.revealed = new Set(Array.from({ length: 9 }, (_x, index) => index)); this.active = false; this.status = ticket.payout ? `${ticket.payout} Ris RETURN` : "NO MATCH"; recordRemote("scratch",ticket.ticketId,this.bet,ticket.payout||0,ticket.payout?"MIDNIGHT SCRATCH WIN":"SCRATCH RESULT",this.status,ticket.payout?[{event:"scratchWin"}]:[]); this.drawTicket(); setWallet(ticket.wallet);
      } catch (error) { this.app.toast("SCRATCH UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L"); }
      this.renderUi();
    };
    const localScratch = game.scratch;
    game.scratch = function (event) {
      const before = new Set(this.revealed);
      localScratch.call(this, event);
      const index = [...this.revealed].find((value) => !before.has(value));
      if (index === undefined || this.revealed.size >= 9 || !this.remoteTicketId || this.remoteScratchReveals?.has(index)) return;
      this.remoteScratchReveals.add(index);
      post(`/api/games/scratch/tickets/${encodeURIComponent(this.remoteTicketId)}/reveal`, { actionId: crypto.randomUUID(), index }).then((payload) => {
        const ticket = payload.ticket;
        this.symbols = ticket.symbols.map((id, cell) => id ? symbols[id] : this.symbols[cell]);
        this.revealed = new Set(ticket.revealed);
        if (ticket.phase === "settled") { this.active = false; this.resolved = true; this.status = ticket.payout ? `${ticket.payout} Ris RETURN` : "NO MATCH"; recordRemote("scratch",ticket.ticketId,this.bet,ticket.payout||0,ticket.payout?"MIDNIGHT SCRATCH WIN":"SCRATCH RESULT",this.status,ticket.payout?[{event:"scratchWin"}]:[]); }
        setWallet(ticket.wallet); this.drawTicket(); this.renderUi();
      }).catch((error) => gameError(this, "SCRATCH UNAVAILABLE", error));
    };
  }

  function gameError(game, title, error) { game.app.toast(title, error instanceof Error ? error.message : "Please try again.", "L"); }
  function patchHoldem(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched = true;
    const apply = (round) => { const s = round.state; game.remoteRoundId = round.id; game.player = s.player; game.dealer = s.dealer; game.board = s.board; game.phase = round.phase === "active" ? "decision" : "result"; game.status = round.phase === "active" ? "CALL OR FOLD" : (round.payout ? "PLAYER WINS" : "HOUSE WINS"); setWallet(round.wallet); };
    game.deal = async function () { if (this.busy || this.phase !== "betting") return; this.busy = true; this.status = "DEALING FROM THE IRIS SHOE"; this.render(); try { apply((await post("/api/games/holdem/rounds", { roundId: crypto.randomUUID(), bet: this.bet })).round); this.app.audio.play("deal"); } catch (e) { gameError(this, "HOLD'EM UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    const act = async function (action) { if (this.busy || !this.remoteRoundId || this.phase !== "decision") return; this.busy = true; try { const round=(await post(`/api/games/holdem/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, { actionId: crypto.randomUUID(), action })).round; apply(round); recordRemote("holdem",round.id,action==="call"?this.bet*3:this.bet,round.payout||0,action==="fold"?"HOLD'EM FOLD":"ECLIPSE HOLD'EM",this.status); this.app.audio.play(this.remoteRoundId && this.phase === "result" && this.status.includes("WINS") ? "win" : "lose"); } catch (e) { gameError(this, "HOLD'EM UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    game.call = function () { return act.call(this, "call"); }; game.fold = function () { return act.call(this, "fold"); };
  }
  function patchTower(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched = true;
    const apply = (round) => { const s = round.state; game.remoteRoundId = round.id; game.active = round.phase === "active"; game.floor = s.floor; game.multiplier = s.multiplier; game.traps = new Set(s.traps); game.ward = s.ward; game.revealed = s.revealed !== null; game.status = round.phase === "settled" ? (round.payout ? "TOWER CASH OUT" : "THE TOWER CLAIMS THE RUN") : "CHOOSE A SEALED DOOR"; setWallet(round.wallet); };
    game.start = async function () { if (this.active || this.busy) return; this.busy = true; try { apply((await post("/api/games/tower/rounds", { roundId: crypto.randomUUID(), bet: this.bet })).round); this.app.audio.play("chime"); } catch (e) { gameError(this, "TOWER UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    game.choose = async function (door) { if (!this.active || this.busy || this.revealed) return; this.busy = true; try { const round=(await post(`/api/games/tower/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, { actionId: crypto.randomUUID(), action: "door", door })).round; apply(round); if(round.phase==="settled")recordRemote("tower",round.id,this.bet,round.payout||0,round.payout?"OBSIDIAN TOWER":"TOWER FALL",`FLOOR ${round.state.floor}`,round.state.floor>=10?[{event:"towerSummit"}]:[]); this.app.audio.play(this.active ? "win" : "lose"); } catch (e) { gameError(this, "TOWER UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    game.cash = async function () { if (!this.active || this.busy || this.floor < 2) return; this.busy = true; try { const round=(await post(`/api/games/tower/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, { actionId: crypto.randomUUID(), action: "cash" })).round; apply(round); recordRemote("tower",round.id,this.bet,round.payout||0,"TOWER CASH OUT",`FLOOR ${round.state.floor}`); this.app.audio.play("win"); } catch (e) { gameError(this, "TOWER UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
  }
  function patchThreeCard(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched = true;
    const apply = (round) => { const s = round.state; game.remoteRoundId = round.id; game.player = s.player; game.dealer = s.dealer; game.playerEval = s.playerEval; game.dealerEval = s.dealerEval; game.phase = round.phase === "active" ? "decision" : "result"; game.status = round.phase === "active" ? "PLAY OR FOLD" : (round.payout ? "SERAPH RETURN" : "DEALER WINS"); setWallet(round.wallet); };
    game.deal = async function () { if (this.busy || this.phase !== "betting") return; this.busy = true; try { apply((await post("/api/games/threecard/rounds", { roundId: crypto.randomUUID(), bet: this.bet, pairPlus: this.pairPlus })).round); this.app.audio.play("deal"); } catch (e) { gameError(this, "THREE CARD UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    const act = async function (action) { if (this.busy || this.phase !== "decision") return; this.busy = true; try { const round=(await post(`/api/games/threecard/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, { actionId: crypto.randomUUID(), action })).round; apply(round); recordRemote("threecard",round.id,this.bet*(action==="play"?2+(this.pairPlus?1:0):1+(this.pairPlus?1:0)),round.payout||0,"SERAPH THREE CARD",this.status,round.state.playerEval?.rank===6?[{event:"threecardSF"}]:[]); this.app.audio.play(this.status.includes("RETURN") ? "win" : "lose"); } catch (e) { gameError(this, "THREE CARD UNAVAILABLE", e); } finally { this.busy = false; this.render(); } };
    game.play = function () { return act.call(this, "play"); }; game.fold = function () { return act.call(this, "fold"); };
  }
  function patchDerby(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched = true;
    game.race = async function () { if (this.racing) return; this.racing = true; this.status = "THE IRIS TRACK IS RUNNING"; this.render(); try { const round = (await post("/api/games/derby/rounds", { roundId: crypto.randomUUID(), bet: this.bet, selection: this.selected })).round, s = round.state; this.form = s.form; this.odds = s.odds; this.order = s.order; this.progress.fill(0); const duration = this.app.profile.data.settings.reducedMotion ? 600 : 4300, start = performance.now(); await new Promise(resolve => { const tick = now => { const t = Math.min(1, (now-start)/duration), ease = 1-Math.pow(1-t,2.6); for(let i=0;i<6;i++){const place=this.order.indexOf(i),finish=.985-place*.035;this.progress[i]=ease*finish;} this.paintRace(); if(t<1)requestAnimationFrame(tick);else resolve(); }; requestAnimationFrame(tick); }); const winner = this.order[0]; this.history.unshift(winner); this.history=this.history.slice(0,6); this.status = winner === this.selected ? "PHANTOM VICTORY" : "PHOTO FINISH"; recordRemote("derby",round.id,this.bet,round.payout||0,round.payout&&s.odds[winner]>=7?"UNDERDOG VICTORY":"PHANTOM DERBY",`#${winner+1}`,round.payout&&s.odds[winner]>=7?[{event:"derbyUnderdog"}]:[]); setWallet(round.wallet); this.app.audio.play(round.payout ? "bigwin" : "lose"); } catch (e) { gameError(this, "DERBY UNAVAILABLE", e); } finally { this.racing=false; this.render(); } };
  }
  function patchAscent(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched = true;
    const finish = (round) => { game.multiplier = round.state.multiplier; game.phase = round.payout ? "result" : "crashed"; game.status = round.payout ? "CASH OUT SECURED" : "COLLAPSED"; recordRemote("ascent",round.id,game.bet,round.payout||0,round.payout&&round.state.multiplier>=10?"TENFOLD ASCENT":"ECLIPSE ASCENT",game.status,round.payout&&round.state.multiplier>=10?[{event:"ascentTen"}]:[]); clearInterval(game.irisAscentTimer); cancelAnimationFrame(game.raf); setWallet(round.wallet); game.app.audio.play(round.payout ? "win" : "lose"); game.render(); game.draw(); };
    const poll = async () => { if (game.phase !== "running" || game.irisAscentPolling) return; game.irisAscentPolling = true; try { const round=(await post(`/api/games/ascent/rounds/${encodeURIComponent(game.remoteRoundId)}/actions`, {actionId:crypto.randomUUID(),action:"tick"})).round; if(round.phase === "settled") finish(round); } catch(e) { gameError(game,"ASCENT UNAVAILABLE",e); } finally { game.irisAscentPolling=false; } };
    game.start = async function () { if (this.phase !== "idle") return; try { const round=(await post("/api/games/ascent/rounds", { roundId:crypto.randomUUID(),bet:this.bet,auto:this.auto })).round; this.remoteRoundId=round.id; this.phase="running"; this.multiplier=1; this.crashPoint=Infinity; this.startTime=serverClockStart(round); this.status="ASCENDING"; clearInterval(this.irisAscentTimer); this.irisAscentTimer=setInterval(poll,this.app.profile.data.settings.reducedMotion?300:450); setWallet(round.wallet); this.loop(this.startTime); this.render(); } catch(e) { gameError(this,"ASCENT UNAVAILABLE",e); } };
    game.cash = async function () { if (this.phase !== "running" || this.busy) return; this.busy=true; try { finish((await post(`/api/games/ascent/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`, {actionId:crypto.randomUUID(),action:"cash"})).round); } catch(e) { gameError(this,"ASCENT UNAVAILABLE",e); } finally { this.busy=false; } };
  }
  function patchArcana(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched=true;
    const glyph={moon:"M",star:"S",rose:"R",diamond:"D",crown:"C",wild:"W",sun:"O",eye:"E"}; const apply=(round)=>{const s=round.state;game.remoteRoundId=round.id;game.cards=s.cards.map((symbol,id)=>({id,symbol:glyph[symbol]||symbol}));game.open=s.open;game.matched=new Set(s.matched);game.moves=s.moves; if(round.phase==="settled"){game.phase="result";game.status=round.payout?"ARCANA COMPLETE":"TIME OUT";recordRemote("arcana",round.id,game.bet,round.payout||0,round.payout&&s.moves<=10?"PERFECT ARCANA":"ARCANA MATCH",`${s.moves} MOVES`,round.payout&&s.moves<=10?[{event:"arcanaPerfect"}]:[]);}setWallet(round.wallet);};
    game.start=async function(){if(this.phase!=="idle")return;try{const round=(await post("/api/games/arcana/rounds",{roundId:crypto.randomUUID(),bet:this.bet})).round;apply(round);this.phase="preview";this.open=Array.from({length:16},(_,i)=>i);this.render();this.setTimeout(async()=>{try{const started=(await post(`/api/games/arcana/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`,{actionId:crypto.randomUUID(),action:"begin"})).round;apply(started);this.open=[];this.phase="playing";this.startedAt=serverClockStart(started);this.timer=this.setInterval(()=>this.tick(),100);this.render();}catch(e){gameError(this,"ARCANA UNAVAILABLE",e);}},this.app.profile.data.settings.reducedMotion?500:1700);}catch(e){gameError(this,"ARCANA UNAVAILABLE",e);}};
    game.tick=function(){if(this.phase!=="playing")return;this.time=Math.max(0,45-(performance.now()-this.startedAt)/1000);if(this.time>0){this.renderHud();return;}clearInterval(this.timer);this.timer=null;this.phase="settling";post(`/api/games/arcana/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`,{actionId:crypto.randomUUID(),action:"timeout"}).then(payload=>{apply(payload.round);this.app.audio.play("lose");this.render();}).catch(e=>{this.phase="playing";gameError(this,"ARCANA UNAVAILABLE",e);this.render();});};
    game.flip=async function(index){if(this.phase!=="playing"||this.busy||this.open.includes(index)||this.matched.has(index))return;this.open.push(index);this.app.audio.play("card");this.render();const second=this.open.length===2;if(second)this.busy=true;try{const round=(await post(`/api/games/arcana/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`,{actionId:crypto.randomUUID(),action:"flip",index})).round;if(second)await core.wait(this.app.profile.data.settings.reducedMotion?80:650);apply(round);if(round.phase==="settled")this.app.audio.play(round.payout?"win":"lose");}catch(e){gameError(this,"ARCANA UNAVAILABLE",e);}finally{this.busy=false;this.render();}};
  }
  function patchMoonshot(game) {
    if (game.irisEconomyPatched) return; game.irisEconomyPatched=true;
    game.start=async function(){if(this.phase!=="idle")return;try{const round=(await post("/api/games/moonshot/rounds",{roundId:crypto.randomUUID(),bet:this.bet})).round;this.remoteRoundId=round.id;this.phase="aiming";this.throwNo=0;this.scores=[];this.startTime=serverClockStart(round);this.loop(this.startTime);setWallet(round.wallet);this.render();}catch(e){gameError(this,"MOONSHOT UNAVAILABLE",e);}};
    game.throwDart=async function(){if(this.phase!=="aiming"||this.busy)return;this.busy=true;try{const round=(await post(`/api/games/moonshot/rounds/${encodeURIComponent(this.remoteRoundId)}/actions`,{actionId:crypto.randomUUID(),action:"throw"})).round;this.scores=round.state.scores;this.throwNo=this.scores.length;if(round.phase==="settled"){const total=this.scores.reduce((a,b)=>a+b,0);cancelAnimationFrame(this.raf);this.phase="result";this.status=`${total} POINTS`;recordRemote("moonshot",round.id,this.bet,round.payout||0,total===300?"PERFECT MOONSHOT":"MOONSHOT DARTS",this.status,total===300?[{event:"moonshotPerfect"}]:[],total);setWallet(round.wallet);}else this.startTime=serverClockStart(round);this.app.audio.play(round.payout?"win":"stop");}catch(e){gameError(this,"MOONSHOT UNAVAILABLE",e);}finally{this.busy=false;this.render();this.draw(true);}};
  }

  const previousOpen = core.CasinoApp.prototype.openGame;
  core.CasinoApp.prototype.openGame = function (id) {
    previousOpen.call(this, id);
    if (id === "dragon") patchDragon(this.gameInstance);
    if (id === "wheel") patchWheel(this.gameInstance);
    if (id === "craps") patchCraps(this.gameInstance);
    if (id === "plinko") patchPlinko(this.gameInstance);
    if (id === "hilo") patchHiLo(this.gameInstance);
    if (id === "mines") patchMines(this.gameInstance);
    if (id === "war") patchWar(this.gameInstance);
    if (id === "bingo") patchBingo(this.gameInstance);
    if (id === "scratch") patchScratch(this.gameInstance);
    if (id === "holdem") patchHoldem(this.gameInstance);
    if (id === "tower") patchTower(this.gameInstance);
    if (id === "threecard") patchThreeCard(this.gameInstance);
    if (id === "derby") patchDerby(this.gameInstance);
    if (id === "ascent") patchAscent(this.gameInstance);
    if (id === "arcana") patchArcana(this.gameInstance);
    if (id === "moonshot") patchMoonshot(this.gameInstance);
  };
})();
