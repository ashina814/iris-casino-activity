(function () {
  const storageKey = "iris-activity-pending-requests-v2";
  const legacyStorageKey = "iris-activity-pending-requests-v1";
  const ttlMs = 15 * 60 * 1000;
  let userScope = null;
  let scopeResolved = false;
  let resolveScope;
  const scopeReady = new Promise((resolve) => { resolveScope = resolve; });

  function read() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
  function write(value) { try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {} }
  function canonicalize(value) {
    if (value === undefined) return { $undefined: true };
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : { $number: String(value) };
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    return { $type: typeof value, value: String(value) };
  }
  function fingerprint(value) { return JSON.stringify(canonicalize(value)); }
  function keyFor(operation, roundId) { if (!userScope) throw new Error("Authentication is not ready."); return `${userScope}:${operation}:${roundId || "new"}`; }
  function isExpired(value) { return !Number.isSafeInteger(value?.createdAt) || Date.now() - value.createdAt > ttlMs; }

  function begin(operation, create, options = {}) {
    const payload = create();
    const roundId = options.roundId || payload.roundId || payload.id || null;
    const key = keyFor(operation, roundId);
    const pending = read();
    const existing = pending[key];
    const fingerprintPayload = { ...payload }; delete fingerprintPayload.id; delete fingerprintPayload.roundId; delete fingerprintPayload.ticketId;
    const payloadFingerprint = fingerprint(fingerprintPayload);
    if (existing && !isExpired(existing)) {
      if (existing.payloadFingerprint !== payloadFingerprint) throw new Error("This action is already pending with different details.");
      return { ...payload, id: existing.id, stale: false };
    }
    if (existing && isExpired(existing)) return { ...payload, id: existing.id, stale: true };
    const id = payload.id || crypto.randomUUID();
    pending[key] = { id, operation, payloadFingerprint, createdAt: Date.now(), userScope, roundId };
    write(pending);
    return { ...payload, id, stale: false };
  }

  function complete(operation, id, options = {}) {
    const pending = read();
    for (const [key, value] of Object.entries(pending)) if (value && value.operation === operation && value.id === id && (!options.roundId || value.roundId === options.roundId)) delete pending[key];
    write(pending);
  }
  function adopt(operation, payload, options = {}) {
    const idField = options.idField || "actionId";
    const roundId = options.roundId || null;
    const key = keyFor(operation, roundId);
    const pending = read();
    const canonical = { ...payload };
    delete canonical[idField]; delete canonical.roundId; delete canonical.ticketId;
    const payloadFingerprint = fingerprint(canonical);
    const existing = pending[key];
    if (existing && !isExpired(existing)) {
      if (existing.payloadFingerprint !== payloadFingerprint) throw new Error("Complete or resume the previous action before sending different details.");
      return { id: existing.id, stale: false };
    }
    if (existing && isExpired(existing)) return { id: existing.id, stale: true };
    const id = payload[idField] || crypto.randomUUID();
    pending[key] = { id, operation, payloadFingerprint, createdAt: Date.now(), userScope, roundId };
    write(pending);
    return { id, stale: false };
  }
  function discard(operation, roundId) { const pending = read(); delete pending[keyFor(operation, roundId || null)]; write(pending); }
  function setUserScope(value) {
    const nextScope = String(value || "");
    if (!nextScope) return;
    const pending = read();
    for (const [key, request] of Object.entries(pending)) if (request?.userScope === "anonymous") delete pending[key];
    write(pending);
    userScope = nextScope;
    if (!scopeResolved) { scopeResolved = true; resolveScope(nextScope); }
  }
  async function waitForUserScope() {
    if (scopeResolved && userScope) return userScope;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Authentication is not ready.")), 5_000));
    return Promise.race([scopeReady, timeout]);
  }
  function clearStale() { const pending = read(); for (const [key, value] of Object.entries(pending)) if (isExpired(value)) delete pending[key]; write(pending); }

  try { sessionStorage.removeItem(legacyStorageKey); } catch {}
  window.__IRIS_ACTIVITY_REQUESTS__ = { begin, complete, adopt, discard, setUserScope, waitForUserScope, fingerprint, clearStale, ttlMs };
})();
