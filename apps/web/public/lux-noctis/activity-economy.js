(function () {
  if (!window.IRIS_ACTIVITY_MODE || !window.LUX_ACTIVITY_USER) return;

  const app = window.__LUX_NOCTIS__;
  if (!app) return;

  let busy = false;
  let reliefBusy = false;
  let treasuryBusy = false;
  let missionRefresh = 0;
  const pendingPurchases = new Map();

  function applyDailyState(daily) {
    if (!daily || typeof daily !== "object") return;
    app.profile.data.lastDaily = daily.claimed ? daily.date : "";
    app.profile.data.dailyStreak = Number.isInteger(daily.streak) ? daily.streak : app.profile.data.dailyStreak;
    const economy = app.profile.data.economy;
    if (economy) {
      if (Number.isInteger(daily.reserve) && daily.reserve >= 0) economy.reserve = daily.reserve;
      if (Number.isInteger(daily.notes) && daily.notes >= 0) economy.notes = daily.notes;
    }
    if (Number.isInteger(daily.wallet) && daily.wallet >= 0) window.__IRIS_SET_WALLET?.(daily.wallet);
    app.profile.save();
    app.updateDaily();
  }

  async function request(path, method) {
    const response = await fetch(path, { method, credentials: "include" });
    if (!response.ok) throw new Error("activity economy unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.daily) throw new Error("invalid activity economy response");
    return payload.daily;
  }

  function applyTreasuryState(treasury) {
    if (!treasury || typeof treasury !== "object") return;
    const economy = app.profile.data.economy;
    if (economy) {
      if (Number.isInteger(treasury.reserve) && treasury.reserve >= 0) economy.reserve = treasury.reserve;
      if (Number.isInteger(treasury.notes) && treasury.notes >= 0) economy.notes = treasury.notes;
      if (Number.isInteger(treasury.seals) && treasury.seals >= 0) economy.seals = treasury.seals;
      if (treasury.purchases && typeof treasury.purchases === "object") economy.purchases = { ...economy.purchases, ...treasury.purchases };
    }
    if (Number.isInteger(treasury.wallet) && treasury.wallet >= 0) window.__IRIS_SET_WALLET?.(treasury.wallet);
    app.profile.save();
    app.economy?.applySealVisual?.();
    app.economy?.updateAll?.();
  }

  async function requestTreasury(path, method, body) {
    const response = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error("treasury unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.treasury) throw new Error("invalid treasury response");
    return payload.treasury;
  }

  async function requestRelief() {
    const response = await fetch("/api/economy/relief", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("relief unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.relief) throw new Error("invalid relief response");
    return payload.relief;
  }

  async function requestMissions() {
    const response = await fetch("/api/economy/missions", { credentials: "include" });
    if (!response.ok) throw new Error("missions unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.missions) throw new Error("invalid missions response");
    return payload.missions;
  }

  function applyMissions(missions) {
    if (!missions || !Array.isArray(missions.items)) return;
    const localItems = new Map(app.profile.data.missions.items.map((item) => [item.id, item]));
    app.profile.data.missions = {
      date: missions.date || app.profile.data.missions.date,
      items: missions.items.map((item) => ({ ...localItems.get(item.id), ...item }))
    };
    if (Number.isInteger(missions.wallet) && missions.wallet >= 0) window.__IRIS_SET_WALLET?.(missions.wallet);
    app.profile.save();
    app.renderMissions();
  }

  function refreshMissions() {
    const refresh = ++missionRefresh;
    void requestMissions().then((missions) => {
      if (refresh === missionRefresh) applyMissions(missions);
    }).catch(() => {});
  }

  function purchaseId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
    return `purchase${Date.now()}${Math.random().toString(36).slice(2)}`;
  }

  function pendingPurchaseStorageKey(key) {
    return `iris-pending-treasury-${window.LUX_ACTIVITY_USER.id}-${key}`;
  }

  function loadPendingPurchase(key) {
    const memoryValue = pendingPurchases.get(key);
    if (memoryValue) return memoryValue;
    try {
      const storedValue = window.sessionStorage.getItem(pendingPurchaseStorageKey(key));
      return /^[A-Za-z0-9_-]{8,80}$/.test(storedValue || "") ? storedValue : null;
    } catch {
      return null;
    }
  }

  function savePendingPurchase(key, value) {
    pendingPurchases.set(key, value);
    try {
      window.sessionStorage.setItem(pendingPurchaseStorageKey(key), value);
    } catch {
      // The in-memory value still protects retries in this page.
    }
  }

  function clearPendingPurchase(key) {
    pendingPurchases.delete(key);
    try {
      window.sessionStorage.removeItem(pendingPurchaseStorageKey(key));
    } catch {
      // Nothing further is required when browser storage is unavailable.
    }
  }

  app.claimDaily = async function () {
    if (busy) return;
    busy = true;
    const button = document.querySelector("#claimDailyButton");
    if (button) button.disabled = true;
    try {
      const daily = await request("/api/economy/daily/claim", "POST");
      applyDailyState(daily);
      if (daily.claimed) {
        this.audio.play(daily.amount ? "bigwin" : "chime");
        this.celebration.burst(daily.amount ? 0.55 : 0.25);
        const noteText = daily.notesAwarded ? ` ${daily.notesAwarded} CROWN NOTESへ変換しました。` : "";
        this.toast("MIDNIGHT GIFT", `${daily.amount.toLocaleString("ja-JP")} Risを受け取りました。${noteText}`, "GIFT");
      } else {
        this.toast("MIDNIGHT GIFT", "今夜の贈り物は受け取り済みです。", "GIFT");
      }
      setTimeout(() => this.closeModal(), 700);
    } catch {
      this.toast("MIDNIGHT GIFT", "RIS台帳へ接続できませんでした。", "!");
      this.updateDaily();
    } finally {
      busy = false;
    }
  };

  app.maybeRelief = async function () {
    if (reliefBusy) return;
    reliefBusy = true;
    try {
      const relief = await requestRelief();
      if (!relief.claimed) return;
      window.__IRIS_SET_WALLET?.(relief.wallet);
      this.profile.data.lastRelief = Date.now();
      if (this.profile.data.economy) this.profile.data.economy.reliefUsed = true;
      this.profile.save();
      this.audio.play("chime");
      this.toast("PALACE RELIEF", `RIS wallet was restored by ${relief.amount.toLocaleString("ja-JP")} Ris.`, "R");
    } catch {
      // A later settled round will retry the server-owned eligibility check.
    } finally {
      reliefBusy = false;
    }
  };

  const recordRemoteProgress = app.recordRemoteProgress;
  app.profile.progress = function () {};
  app.recordRemoteProgress = function (...args) {
    const result = recordRemoteProgress.apply(this, args);
    void this.maybeRelief();
    refreshMissions();
    return result;
  };

  if (app.economy) {
    app.economy.buy = async function (id, pay) {
      if (treasuryBusy) return;
      treasuryBusy = true;
      const key = `${id}:${pay}`;
      const idempotencyKey = loadPendingPurchase(key) || purchaseId();
      savePendingPurchase(key, idempotencyKey);
      try {
        const treasury = await requestTreasury("/api/economy/treasury/purchases", "POST", {
          purchaseId: idempotencyKey,
          itemId: id,
          pay
        });
        clearPendingPurchase(key);
        applyTreasuryState(treasury);
        if (id === "stardust" && this.app.ascension) this.app.ascension.data.stardust += 250;
        if (id === "capsule" && this.app.ascension) this.app.ascension.data.capsules += 1;
        if (id === "key" && this.app.eternal) this.app.eternal.data.keys += 1;
        this.addLedger(pay === "notes" ? "notes" : "sink", pay === "notes" ? 0 : 1, `${id.toUpperCase()} / ${pay.toUpperCase()}`, "out");
        this.app.ascension?.updateAll?.();
        this.app.eternal?.updateAll?.();
        this.app.audio.play("chime");
        this.app.celebration.burst(0.28);
        this.app.toast("TREASURY", "Exchange completed.", "T");
        this.updateAll();
        setTimeout(() => this.open("exchange"), 0);
      } catch {
        this.app.toast("TREASURY", "RIS ledger could not complete the exchange.", "!");
      } finally {
        treasuryBusy = false;
      }
    };
  }

  request("/api/economy/daily", "GET")
    .then(applyDailyState)
    .catch(() => {});
  requestTreasury("/api/economy/treasury", "GET")
    .then(applyTreasuryState)
    .catch(() => {});
  refreshMissions();
})();
