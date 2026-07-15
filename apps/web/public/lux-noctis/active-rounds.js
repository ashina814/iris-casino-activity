(function () {
  const storageKey = "iris-activity-active-rounds-v1";
  function read() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
  function write(value) { try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {} }
  function remember(round) { const rounds = read(); rounds[round.game] = { game: round.game, roundId: round.roundId, savedAt: Date.now() }; write(rounds); }
  function forget(game) { const rounds = read(); delete rounds[game]; write(rounds); }
  async function restore() {
    try {
      const response = await fetch("/api/casino/active-rounds", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      window.__IRIS_ACTIVITY_REQUESTS__?.setUserScope(payload?.userId);
      const rounds = Array.isArray(payload?.rounds) ? payload.rounds : [];
      const persisted = read();
      for (const game of Object.keys(persisted)) if (!rounds.some((round) => round.game === game)) forget(game);
      for (const round of rounds) { remember(round); window.dispatchEvent(new CustomEvent("iris-active-round", { detail: round })); }
      window.__IRIS_ACTIVE_ROUNDS__ = rounds;
    } catch {}
  }
  function multiStepRequest(url, init) {
    if ((init?.method || "GET").toUpperCase() !== "POST" || !url.includes("/api/games/")) return null;
    let body; try { body = JSON.parse(init.body); } catch { return null; }
    const match = url.match(/\/api\/games\/([^/]+)\/(?:rounds|tickets)(?:\/([^/]+))?(?:\/(?:actions|roll|guess|cash|reveal))?$/);
    if (!match) return null;
    const game = match[1], roundId = match[2] || body.roundId || body.ticketId || null;
    const idField = body.actionId ? "actionId" : body.ticketId ? "ticketId" : body.roundId ? "roundId" : null;
    if (!idField) return null;
    const isStart = !match[2];
    const operation = isStart ? `${game}:start` : `${game}:${roundId}:${body.action || url.split("/").pop()}`;
    const pendingRoundId = isStart ? null : roundId;
    const adopted = window.__IRIS_ACTIVITY_REQUESTS__?.adopt(operation, body, { roundId: pendingRoundId, idField });
    if (!adopted || adopted.stale) return { stale: true, operation, roundId: pendingRoundId };
    body[idField] = adopted.id;
    return { game, operation, roundId: pendingRoundId, id: adopted.id, init: { ...init, body: JSON.stringify(body) } };
  }
  function activeStartGame(url, init) {
    if ((init?.method || "GET").toUpperCase() !== "POST") return null;
    const match = url.match(/\/api\/games\/([^/]+)\/(rounds|tickets)$/);
    if (!match) return null;
    const game = match[1];
    if (!window.__IRIS_ACTIVE_ROUNDS__?.some((round) => round.game === game)) return null;
    return { game, ticket: match[2] === "tickets" };
  }
  function resumedPayload(active, ticket) {
    const round = { ...active.state, id: active.roundId, roundId: active.roundId, ticketId: active.roundId, phase: active.phase, wallet: active.wallet };
    return ticket ? { ok: true, ticket: round } : { ok: true, round };
  }
  const originalFetch = window.fetch.bind(window);
  async function confirmRecovery(request) {
    const response = await originalFetch(`/api/games/${encodeURIComponent(request.game)}/active-round`, { credentials: "include", cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.round?.phase === "reconciliation_failed") return "support_required";
    if (payload?.round) return "resume_required";
    return "ambiguous";
  }
  window.fetch = async function (...args) {
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    const activeStart = activeStartGame(url, args[1]);
    if (activeStart) {
      const response = await originalFetch(`/api/games/${encodeURIComponent(activeStart.game)}/active-round`, { credentials: "include", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.round) return new Response(JSON.stringify(resumedPayload(payload.round, activeStart.ticket)), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((args[1]?.method || "GET").toUpperCase() === "POST" && url.includes("/api/games/")) await window.__IRIS_ACTIVITY_REQUESTS__?.waitForUserScope();
    const request = multiStepRequest(url, args[1]);
    if (request?.stale) throw new Error("A previous action needs server recovery before a new request can be sent.");
    const response = await originalFetch(args[0], request?.init || args[1]);
    if (request && response.ok) window.__IRIS_ACTIVITY_REQUESTS__?.complete(request.operation, request.id, { roundId: request.roundId });
    if (request && !response.ok) response.clone().json().then(async (payload) => {
      if (["casino_transaction_conflict", "casino_transaction_not_found"].includes(payload?.error?.code)) await confirmRecovery(request);
      if (payload?.error?.recovery === "terminal") window.__IRIS_ACTIVITY_REQUESTS__?.discard(request.operation, request.roundId);
    }).catch(() => {});
    if (response.ok && url.includes("/api/games/")) response.clone().json().then((payload) => {
      const round = payload?.round || payload?.ticket;
      if (!round) return;
      const game = url.match(/\/api\/games\/([^/]+)/)?.[1];
      const roundId = round.id || round.roundId || round.ticketId;
      if (!game || !roundId) return;
      if (["settled", "cancelled", "reconciliation_failed"].includes(round.phase)) forget(game);
      else remember({ game, roundId });
    }).catch(() => {});
    return response;
  };
  window.__IRIS_ACTIVE_ROUNDS__ = [];
  window.__IRIS_ACTIVE_ROUND_STORE__ = { remember, forget, restore };
  restore();
})();
