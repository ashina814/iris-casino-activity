(function () {
  if (!window.IRIS_ACTIVITY_MODE || !window.LUX_ACTIVITY_USER) return;

  const app = window.__LUX_NOCTIS__;
  if (!app) return;

  app.profile.credit = function () { return 0; };

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
  let circuitRefresh = 0;
  let odysseyRefresh = 0;
  let albumRefresh = 0;
  let sovereignRefresh = 0;
  let artifactRefresh = 0;
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
    if (Number.isInteger(payload.weekly.eventTokens)) app.ascension.data.eventTokens = payload.weekly.eventTokens;
    applyAlbums(payload.weekly.collection);
    window.__IRIS_SET_WALLET?.(payload.weekly.wallet);
    app.profile.save();
  }

  async function refreshMystery(openWhenAvailable = false) {
    const response = await fetch("/api/economy/mystery", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.mystery) return;
    mysteryOffer = payload.mystery.offer;
    if (Number.isInteger(payload.mystery.eventTokens)) app.ascension.data.eventTokens = payload.mystery.eventTokens;
    applyAlbums(payload.mystery.collection);
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
    if (Number.isInteger(season.eventTokens)) app.ascension.data.eventTokens = season.eventTokens;
    applyAlbums(season.collection);
    if (Number.isInteger(season.wallet) && season.wallet >= 0) window.__IRIS_SET_WALLET?.(season.wallet);
    app.profile.save();
    app.ascension.updateAll();
  }

  async function refreshCircuit() {
    const refresh = ++circuitRefresh;
    const response = await fetch("/api/economy/circuit", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (refresh !== circuitRefresh || !response.ok || !payload?.ok || !payload.circuit || !app.sovereign) return;
    applyCircuit(payload.circuit);
  }

  function applyCircuit(circuit) {
    if (!circuit || !app.sovereign) return;
    const local = app.sovereign.data.circuit;
    Object.assign(local, { day: circuit.day, active: circuit.active, stage: circuit.stage, lives: circuit.lives, score: circuit.score, route: circuit.route, clears: circuit.clears, best: circuit.best, claimedDay: circuit.claimedDay });
    if (Number.isInteger(circuit.wallet) && circuit.wallet >= 0) window.__IRIS_SET_WALLET?.(circuit.wallet);
    app.profile.save();
    app.sovereign.updateAll();
    if (!document.querySelector("#sovereignModal")?.hidden) app.sovereign.render();
  }

  async function refreshOdyssey() {
    const refresh = ++odysseyRefresh;
    const response = await fetch("/api/economy/odyssey", { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (refresh !== odysseyRefresh || !response.ok || !payload?.ok || !payload.odyssey || !app.eternal) return;
    applyOdyssey(payload.odyssey);
  }

  function applyOdyssey(odyssey) {
    if (!odyssey || !app.eternal) return;
    const local = app.eternal.data.odyssey;
    Object.assign(local, { ...odyssey, nodes: (odyssey.nodes || []).map((node) => ({ ...node, icon: app.gameMeta?.(node.game)?.icon || "?" })) });
    if (Number.isInteger(odyssey.wallet) && odyssey.wallet >= 0) window.__IRIS_SET_WALLET?.(odyssey.wallet);
    app.profile.save();
    app.eternal.updateAll();
    if (app.eternal.tab === "odyssey" && app.activeModal?.id === "eternalModal") app.eternal.render("odyssey");
  }

  async function refreshAlbums() {
    const refresh = ++albumRefresh;
    let response = await fetch("/api/economy/albums", { credentials: "include" });
    let payload = await response.json().catch(() => null);
    if (refresh !== albumRefresh || !response.ok || !payload?.ok || !payload.albums || !app.ascension) return;
    if (!payload.albums.migrated) {
      const collection = app.ascension.data.collection || {};
      response = await fetch("/api/economy/albums/migrate", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ owned: Object.keys(collection.owned || {}), capsules: app.ascension.data.capsules || 0, dust: app.ascension.data.stardust || 0, shards: app.ascension.data.crownShards || 0, opened: collection.opened || 0, duplicates: collection.duplicates || 0 }) });
      payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.albums) return;
    }
    applyAlbums(payload.albums);
  }

  function applyAlbums(albums) {
    if (!albums || !app.ascension) return;
    app.ascension.data.collection.owned = Object.fromEntries((albums.owned || []).map((id) => [id, Date.now()]));
    for (const series of albums.claimed || []) app.ascension.data.collection.albums[series] = app.ascension.data.collection.albums[series] || Date.now();
    if (Number.isInteger(albums.capsules)) app.ascension.data.capsules = albums.capsules;
    if (Number.isInteger(albums.dust)) app.ascension.data.stardust = albums.dust;
    if (Number.isInteger(albums.shards)) app.ascension.data.crownShards = albums.shards;
    if (Number.isInteger(albums.opened)) app.ascension.data.collection.opened = albums.opened;
    if (Number.isInteger(albums.duplicates)) app.ascension.data.collection.duplicates = albums.duplicates;
    if (Number.isInteger(albums.wallet) && albums.wallet >= 0) window.__IRIS_SET_WALLET?.(albums.wallet);
    app.profile.save();
  }

  async function refreshSovereign() {
    const refresh = ++sovereignRefresh;
    let response = await fetch("/api/economy/sovereign", { credentials: "include" });
    let payload = await response.json().catch(() => null);
    if (refresh !== sovereignRefresh || !response.ok || !payload?.ok || !payload.sovereign || !app.sovereign) return;
    if (!payload.sovereign.migrated) {
      response = await fetch("/api/economy/sovereign/migrate", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ marks: app.sovereign.data.marks || 0, chests: app.sovereign.data.chests || 0 }) });
      payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.sovereign) return;
    }
    applySovereign(payload.sovereign);
  }

  function applySovereign(sovereign) {
    if (!sovereign || !app.sovereign) return;
    app.sovereign.data.marks = sovereign.marks;
    app.sovereign.data.chests = sovereign.chests;
    if (Number.isInteger(sovereign.wallet) && sovereign.wallet >= 0) window.__IRIS_SET_WALLET?.(sovereign.wallet);
    app.profile.save();
    app.sovereign.updateAll();
    if (app.sovereign.tab === "chest" && app.activeModal?.id === "sovereignModal") app.sovereign.render();
  }

  async function refreshArtifacts() {
    const refresh = ++artifactRefresh;
    let response = await fetch("/api/economy/artifacts", { credentials: "include" });
    let payload = await response.json().catch(() => null);
    if (refresh !== artifactRefresh || !response.ok || !payload?.ok || !payload.artifacts || !app.eternal) return;
    if (!payload.artifacts.migrated) {
      const artifacts = app.eternal.data.artifacts || {};
      response = await fetch("/api/economy/artifacts/migrate", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ owned: Object.keys(artifacts.owned || {}), keys: app.eternal.data.keys || 0, fragments: app.eternal.data.keyFragments || 0, opened: artifacts.opened || 0, duplicates: artifacts.duplicates || 0, shards: artifacts.shards || 0 }) });
      payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.artifacts) return;
    }
    applyArtifacts(payload.artifacts);
  }

  function applyArtifacts(artifacts) {
    if (!artifacts || !app.eternal) return;
    app.eternal.data.artifacts.owned = Object.fromEntries((artifacts.owned || []).map((id) => [id, Date.now()]));
    for (const set of artifacts.claimed || []) app.eternal.data.artifacts.sets[`${set}-claimed`] = true;
    for (const set of ["eclipse", "seraph", "dragon", "oracle", "obsidian", "velvet", "cosmos", "jester"]) app.eternal.data.artifacts.sets[set] = (artifacts.owned || []).filter((id) => id.startsWith(`${set}-`)).length;
    if (Number.isInteger(artifacts.keys)) app.eternal.data.keys = artifacts.keys;
    if (Number.isInteger(artifacts.fragments)) app.eternal.data.keyFragments = artifacts.fragments;
    if (Number.isInteger(artifacts.opened)) app.eternal.data.artifacts.opened = artifacts.opened;
    if (Number.isInteger(artifacts.duplicates)) app.eternal.data.artifacts.duplicates = artifacts.duplicates;
    if (Number.isInteger(artifacts.shards)) app.eternal.data.artifacts.shards = artifacts.shards;
    if (Number.isInteger(artifacts.wallet) && artifacts.wallet >= 0) window.__IRIS_SET_WALLET?.(artifacts.wallet);
    app.profile.save();
  }

  async function claimArtifactSet(eternal, set) {
    const response = await fetch(`/api/economy/artifacts/${encodeURIComponent(set)}/claim`, { method: "POST", credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.artifact) {
      void refreshArtifacts();
      return;
    }
    const artifact = payload.artifact;
    eternal.data.artifacts.sets[`${set}-claimed`] = true;
    applyArtifacts(artifact.artifacts);
    window.__IRIS_SET_WALLET?.(artifact.wallet);
    eternal.app.profile.save();
    eternal.app.audio.play("bigwin");
    eternal.app.bigWin(artifact.amount, "ARTIFACT SET COMPLETE", "RIS settlement recorded");
    eternal.render("artifacts");
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
      if (payload.crown.alreadyClaimed) return;
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
    void refreshCircuit();
    void refreshOdyssey();
    void refreshAlbums();
    void refreshSovereign();
    void refreshArtifacts();
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
    if (Number.isInteger(payload.weekly.eventTokens)) this.data.eventTokens = payload.weekly.eventTokens;
    applyAlbums(payload.weekly.collection);
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
      if (Number.isInteger(payload.season.eventTokens)) this.data.eventTokens = payload.season.eventTokens;
      applyAlbums(payload.season.collection);
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
    app.ascension.openCapsule = async function () {
      const response = await fetch("/api/economy/collection/open", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.drop) { void refreshAlbums(); return; }
      const drop = payload.drop;
      applyAlbums(drop.collection);
      this.lastDrop = { item: drop.item, duplicate: drop.duplicate, shards: drop.shards };
      this.app.profile.save();
      this.app.audio.play(drop.duplicate ? "chip" : "bigwin");
      this.app.celebration.burst(drop.duplicate ? .25 : .55);
      this.renderCollection("capsule");
      this.updateAll();
    };
    app.ascension.craftLegendary = async function () {
      const response = await fetch("/api/economy/collection/craft", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.drop) { void refreshAlbums(); return; }
      const drop = payload.drop;
      applyAlbums(drop.collection);
      this.lastDrop = { item: drop.item, duplicate: false, shards: 0 };
      this.app.profile.save();
      this.app.audio.play("bigwin");
      this.app.celebration.burst(.8);
      this.renderCollection("craft");
      this.updateAll();
    };
    app.ascension.claimAlbum = async function (series) {
      const response = await fetch(`/api/economy/albums/${encodeURIComponent(series)}/claim`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.album) {
        void refreshAlbums();
        return;
      }
      const album = payload.album;
      this.data.collection.albums[series] = Date.now();
      applyAlbums(album.collection);
      window.__IRIS_SET_WALLET?.(album.wallet);
      this.app.profile.save();
      this.app.audio.play("bigwin");
      this.app.celebration.burst(.8);
      this.renderCollection("albums");
      this.updateAll();
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
        if (Number.isInteger(payload.mystery.eventTokens)) this.data.eventTokens = payload.mystery.eventTokens;
        applyAlbums(payload.mystery.collection);
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
  if (app.sovereign) {
    const localCircuitRound = app.sovereign.onRound;
    app.sovereign.onRound = function (payload) {
      const active = this.data.circuit.active;
      this.data.circuit.active = false;
      const result = localCircuitRound.call(this, payload);
      this.data.circuit.active = active;
      void refreshCircuit();
      return result;
    };
    app.sovereign.startCircuit = async function () {
      const response = await fetch("/api/economy/circuit/start", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.circuit) return;
      applyCircuit(payload.circuit);
      this.app.audio.play("chime");
      this.render();
    };
    app.sovereign.openChest = async function () {
      const response = await fetch("/api/economy/sovereign/chest", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.chest) {
        void refreshSovereign();
        return;
      }
      const chest = payload.chest;
      applySovereign(chest);
      this.app.audio.play("bigwin");
      this.app.bigWin(chest.amount, "SOVEREIGN CHEST", "RIS settlement recorded");
      this.render();
    };
  }
  if (app.eternal) {
    app.eternal.handleOdysseyRound = function () {};
    app.eternal.grantArtifact = function () { return null; };
    app.eternal.openArtifactVault = async function () {
      const response = await fetch("/api/economy/artifacts/open", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.vault) { void refreshArtifacts(); return; }
      const vault = payload.vault;
      applyArtifacts(vault.artifacts);
      this.app.profile.save();
      this.render("artifacts");
      this.app.audio.play("bigwin");
      this.app.celebration.burst(.6);
      this.app.toast("ETERNAL VAULT OPEN", vault.drops.length ? vault.drops.map((item) => item.name).join(" · ") : "全秘宝完成ボーナス", "*");
    };
    app.eternal.craftArtifact = async function () {
      const response = await fetch("/api/economy/artifacts/craft", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.craft) { void refreshArtifacts(); return; }
      applyArtifacts(payload.craft.artifacts);
      this.app.profile.save();
      this.render("artifacts");
      this.app.audio.play("chime");
      this.app.toast("ARTIFACT CRAFT COMPLETE", payload.craft.item.name, payload.craft.item.icon);
    };
    app.eternal.updateSet = function (set) {
      const owned = Object.keys(this.data.artifacts.owned).filter((id) => id.startsWith(`${set}-`)).length;
      this.data.artifacts.sets[set] = owned;
      if (owned === 6 && !this.data.artifacts.sets[`${set}-claimed`]) void claimArtifactSet(this, set);
    };
    app.eternal.startOdyssey = async function () {
      const response = await fetch("/api/economy/odyssey/start", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.odyssey) return;
      applyOdyssey(payload.odyssey);
      this.app.audio.play("chime");
      this.render("odyssey");
    };
    app.eternal.selectOdysseyNode = async function (index) {
      const response = await fetch("/api/economy/odyssey/select", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ index }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.odyssey) return;
      applyOdyssey(payload.odyssey);
      const node = payload.odyssey.nodes[index];
      if (!node) return;
      this.app.closeModal();
      this.app.openGame(node.game);
    };
    app.eternal.chooseOdysseyBoon = async function (boon) {
      const floor = this.odyssey.floor;
      const response = await fetch("/api/economy/odyssey/boon", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ boon }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.odyssey) return;
      const result = payload.odyssey;
      if (boon === "fame") this.addRenown(500);
      if (floor >= 12 && !result.active) {
        void refreshArtifacts();
      }
      applyOdyssey(result);
      this.app.audio.play(boon === "coins" || floor >= 12 ? "bigwin" : "chime");
      this.render("odyssey");
    };
    app.eternal.abandonOdyssey = async function () {
      const response = await fetch("/api/economy/odyssey/abandon", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.odyssey) return;
      applyOdyssey(payload.odyssey);
      this.render("odyssey");
    };
  }
  requestTreasury("/api/economy/treasury", "GET")
    .then(applyTreasuryState)
    .catch(() => {});
  refreshMissions();
  void refreshWeekly();
  void refreshMystery();
  void refreshSeason();
  void refreshCircuit();
  void refreshOdyssey();
  void refreshAlbums();
  void refreshSovereign();
  void refreshArtifacts();
  refreshVault();
  refreshNightEvent();
})();
