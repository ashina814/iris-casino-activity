(function () {
  if (!window.IRIS_ACTIVITY_MODE || !window.LUX_ACTIVITY_USER) return;

  const app = window.__LUX_NOCTIS__;
  if (!app) return;

  let busy = false;
  let reliefBusy = false;
  let treasuryBusy = false;
  let missionRefresh = 0;
  let vaultBusy = false;
  let vaultRefresh = 0;
  let nightEventRefresh = 0;
  let mysteryOffer = null;
  let mysteryBusy = false;
  let seasonRefresh = 0;
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

  async function requestVault() {
    const response = await fetch("/api/economy/vault", { credentials: "include" });
    if (!response.ok) throw new Error("vault unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.vault) throw new Error("invalid vault response");
    return payload.vault;
  }

  async function requestNightEvent() {
    const response = await fetch("/api/economy/night-event", { credentials: "include" });
    if (!response.ok) throw new Error("night event unavailable");
    const payload = await response.json();
    if (!payload?.ok || !payload.nightEvent) throw new Error("invalid night event response");
    return payload.nightEvent;
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

  async function refreshWeekly() {
    const response = await fetch("/api/economy/weekly", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.weekly || !app.ascension) return;
    const current = new Map((app.ascension.data.weekly.items || []).map((item) => [item.id, item]));
    app.ascension.data.weekly = { ...app.ascension.data.weekly, id: payload.weekly.week, items: payload.weekly.items.map((item) => ({ ...(current.get(item.id) || item), ...item, complete: item.progress >= item.target })) };
    window.__IRIS_SET_WALLET?.(payload.weekly.wallet);
    app.profile.save();
  }

  async function refreshMystery(openWhenAvailable = false) {
    const response = await fetch("/api/economy/mystery", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.mystery) return;
    mysteryOffer = payload.mystery.offer;
    if (Number.isInteger(payload.mystery.wallet) && payload.mystery.wallet >= 0) window.__IRIS_SET_WALLET?.(payload.mystery.wallet);
    if (openWhenAvailable && mysteryOffer && !mysteryOffer.claimed) app.ascension?.openMystery?.();
  }

  async function refreshSeason() {
    const refresh = ++seasonRefresh;
    const response = await fetch("/api/economy/season", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (refresh !== seasonRefresh || !response.ok || !payload?.ok || !payload.season || !app.ascension) return;
    const season = payload.season;
    app.ascension.data.season = { ...app.ascension.data.season, id: season.id, xp: season.xp, claimed: Object.fromEntries((season.claimed || []).map((tier) => [tier, true])) };
    if (Number.isInteger(season.wallet) && season.wallet >= 0) window.__IRIS_SET_WALLET?.(season.wallet);
    app.profile.save();
    app.ascension.updateAll();
  }

  function applyVault(vault) {
    if (!vault || typeof vault !== "object") return;
    const jackpot = app.profile.data.jackpot;
    if (!jackpot) return;
    if (Number.isInteger(vault.pot) && vault.pot >= 0) jackpot.pot = vault.pot;
    if (Number.isInteger(vault.charge) && vault.charge >= 0) jackpot.charge = vault.charge;
    if (typeof vault.ready === "boolean") jackpot.ready = vault.ready;
    if (Number.isInteger(vault.claims) && vault.claims >= 0) jackpot.claims = vault.claims;
    if (!jackpot.ready) app.jackpotOffer = null;
    if (Number.isInteger(vault.wallet) && vault.wallet >= 0) window.__IRIS_SET_WALLET?.(vault.wallet);
    app.profile.save();
    app.updateHud();
  }

  function refreshVault() {
    const refresh = ++vaultRefresh;
    void requestVault().then((vault) => {
      if (refresh === vaultRefresh) applyVault(vault);
    }).catch(() => {});
  }

  function applyNightEvent(nightEvent) {
    if (!nightEvent || typeof nightEvent !== "object") return;
    app.profile.data.nightEvent = {
      active: typeof nightEvent.active === "string" ? nightEvent.active : null,
      remaining: Number.isInteger(nightEvent.remaining) && nightEvent.remaining >= 0 ? nightEvent.remaining : 0,
      nextIn: Number.isInteger(nightEvent.nextIn) && nightEvent.nextIn >= 0 ? nightEvent.nextIn : 6
    };
    if (Number.isInteger(nightEvent.wallet) && nightEvent.wallet >= 0) window.__IRIS_SET_WALLET?.(nightEvent.wallet);
    app.profile.save();
    app.updateNightEventUi();
  }

  function refreshNightEvent() {
    const refresh = ++nightEventRefresh;
    void requestNightEvent().then((nightEvent) => {
      if (refresh === nightEventRefresh) applyNightEvent(nightEvent);
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

  app.claimJackpot = async function (chestIndex) {
    if (vaultBusy) return;
    vaultBusy = true;
    try {
      const response = await fetch("/api/economy/vault/claim", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chestIndex })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.vault) throw new Error("vault claim unavailable");
      const vault = payload.vault;
      applyVault(vault);
      document.querySelectorAll("[data-jackpot-chest]").forEach((button, index) => {
        button.disabled = true;
        button.classList.add(index === chestIndex ? "opened" : "faded");
        button.querySelector("b").textContent = index === chestIndex ? `+${vault.amount.toLocaleString("ja-JP")} Ris` : "SEALED";
      });
      const reveal = document.querySelector("#jackpotReveal");
      if (reveal) reveal.hidden = false;
      const amount = document.querySelector("#jackpotRevealAmount");
      if (amount) amount.textContent = `+${vault.amount.toLocaleString("ja-JP")} Ris`;
      const text = document.querySelector("#jackpotRevealText");
      if (text) text.textContent = vault.multiplier >= 1 ? "ECLIPSE JACKPOT" : "VAULT PRIZE";
      this.profile.data.stats.jackpots += 1;
      this.profile.unlock("jackpot");
      this.profile.unlockRelic("eclipseKey");
      this.profile.save();
      this.audio.play("bigwin");
      this.bigWin(vault.amount, vault.multiplier >= 1 ? "ECLIPSE JACKPOT" : "VAULT PRIZE", "RIS settlement recorded");
    } catch {
      this.toast("ECLIPSE VAULT", "RIS settlement could not open the vault.", "!");
      refreshVault();
    } finally {
      vaultBusy = false;
    }
  };

  const handlePartyMessage = app.room.handle;
  app.room.handle = function (message) {
    if (message?.type !== "crown") return handlePartyMessage.call(this, message);
    this.crown = 0;
    this.render();
    void claimPartyCrown(this, message.id);
  };

  async function claimPartyCrown(room, crownId, attempt = 0) {
    if (!crownId || room.claimedCrowns.has(crownId)) return;
    try {
      const response = await fetch(`/api/party/crowns/${encodeURIComponent(crownId)}/claim`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room: room.room })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.crown) throw new Error("party crown unavailable");
      room.claimedCrowns.add(crownId);
      window.__IRIS_SET_WALLET?.(payload.crown.wallet);
      room.app.audio.play("bigwin");
      room.app.bigWin(payload.crown.amount, "PARTY CROWN", "RIS celebration reward");
    } catch {
      if (attempt < 2) setTimeout(() => { void claimPartyCrown(room, crownId, attempt + 1); }, 1500 * (attempt + 1));
    }
  }

  const recordRemoteProgress = app.recordRemoteProgress;
  app.profile.progress = function () {};
  app.recordRemoteProgress = function (...args) {
    const activeEvent = this.activeNightEvent?.();
    const round = args[0] || {};
    const result = recordRemoteProgress.apply(this, args);
    const wager = Math.max(0, Math.floor(round.wager || 0));
    const payout = Math.max(0, Math.floor(round.payout || 0));
    const baseXp = Math.max(20, Math.floor(wager * 0.018) + (payout > wager ? 80 : 20));
    if (activeEvent?.id === "stardust") this.profile.addXp(baseXp);
    if (activeEvent?.id === "crown") {
      const boostedXp = Math.floor(baseXp * (1 + Math.min(this.profile.data.streak.current, 10) * 0.1));
      this.profile.addXp(Math.max(0, boostedXp - baseXp));
    }
    void this.maybeRelief();
    refreshMissions();
    void refreshWeekly();
    void refreshMystery(true);
    void refreshSeason();
    refreshVault();
    refreshNightEvent();
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
  if (app.ascension) app.ascension.claimWeekly = async function (id) {
    const item = this.data.weekly.items.find((entry) => entry.id === id);
    if (!item || item.claimed || !item.complete) return;
    const response = await fetch(`/api/economy/weekly/${encodeURIComponent(id)}/claim`, { method: "POST", credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.weekly || payload.weekly.alreadyClaimed) return;
    item.claimed = true;
    window.__IRIS_SET_WALLET?.(payload.weekly.wallet);
    this.addStardust(item.reward.dust, false);
    this.data.eventTokens += item.reward.tokens;
    this.app.profile.save();
    this.app.audio.play("bigwin");
    this.app.celebration.burst(.55);
    this.renderEventHub("contracts");
    this.updateAll();
  };
  if (app.ascension) {
    app.ascension.addSeasonXp = function () {};
    app.ascension.claimSeason = async function (tier) {
      if (this.data.season.claimed[tier]) return;
      const response = await fetch(`/api/economy/season/${encodeURIComponent(tier)}/claim`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.season || payload.season.alreadyClaimed) {
        void refreshSeason();
        return;
      }
      const reward = payload.season.reward;
      this.data.season.claimed[tier] = Date.now();
      if (reward.type === "coins") window.__IRIS_SET_WALLET?.(payload.season.wallet);
      if (reward.type === "dust") this.addStardust(reward.amount, false);
      if (reward.type === "tokens") this.data.eventTokens += reward.amount;
      if (reward.type === "shards") this.data.crownShards += reward.amount;
      if (reward.type === "capsule") this.data.capsules += reward.amount;
      this.data.stats.seasonClaims += 1;
      this.app.profile.save();
      this.app.audio.play("chime");
      this.app.celebration.burst(.3);
      this.renderAscension("chronicle");
      this.updateAll();
    };
    app.ascension.claimAllSeason = async function () {
      for (let tier = 1; tier <= this.seasonTier(); tier += 1) if (!this.data.season.claimed[tier]) await this.claimSeason(tier);
    };
    app.ascension.maybeMysteryDoor = function () {
      if (!this.app.activeModal) void refreshMystery(true);
    };
    app.ascension.openMystery = function () {
      if (this.app.activeModal || !mysteryOffer || mysteryOffer.claimed) return;
      const icons = { coins: "R", dust: "D", capsule: "C", tokens: "T" };
      const labels = { coins: "RIS", dust: "STAR DUST", capsule: "STAR CAPSULE", tokens: "EVENT TOKENS" };
      this.mysteryRewards = mysteryOffer.rewards.map((reward) => ({ ...reward, icon: icons[reward.type], label: labels[reward.type] }));
      document.querySelector("#mysteryReveal").hidden = true;
      document.querySelectorAll(".mystery-doors button").forEach((button) => { button.disabled = false; button.className = ""; });
      this.app.openModal("mysteryModal");
    };
    app.ascension.chooseMystery = async function (index) {
      if (mysteryBusy || !mysteryOffer || !this.mysteryRewards?.[index]) return;
      mysteryBusy = true;
      try {
        const response = await fetch(`/api/economy/mystery/${encodeURIComponent(mysteryOffer.id)}/claim`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ index })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload.mystery?.reward) throw new Error("mystery unavailable");
        const reward = payload.mystery.reward;
        if (reward.type === "coins") window.__IRIS_SET_WALLET?.(payload.mystery.wallet);
        if (reward.type === "dust") this.addStardust(reward.amount, false);
        if (reward.type === "capsule") this.data.capsules += reward.amount;
        if (reward.type === "tokens") this.data.eventTokens += reward.amount;
        this.data.mystery.opened += 1;
        document.querySelectorAll(".mystery-doors button").forEach((button, door) => { button.disabled = true; button.classList.add(door === index ? "opened" : "faded"); });
        const reveal = document.querySelector("#mysteryReveal");
        reveal.hidden = false;
        reveal.innerHTML = `<i>${this.mysteryRewards[index].icon}</i><small>${this.mysteryRewards[index].label}</small><strong>+${Number(reward.amount).toLocaleString("ja-JP")}</strong>`;
        this.app.audio.play("bigwin");
        this.app.celebration.burst(.45);
        this.app.profile.save();
        this.updateAll();
        this.mysteryRewards = null;
        mysteryOffer = null;
      } catch {
        this.app.toast("MYSTERY DOOR", "RIS settlement could not reveal this reward.", "!");
        void refreshMystery();
      } finally {
        mysteryBusy = false;
      }
    };
  }
  requestTreasury("/api/economy/treasury", "GET")
    .then(applyTreasuryState)
    .catch(() => {});
  refreshMissions();
  void refreshWeekly();
  void refreshMystery();
  void refreshSeason();
  refreshVault();
  refreshNightEvent();
})();
