(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.KenoGame) return;

  function setWallet(wallet) {
    window.__IRIS_SET_WALLET?.(wallet);
  }

  core.KenoGame.prototype.draw = async function () {
    if (this.busy) return;
    const picks = [...this.picks];
    if (picks.length < 5 || picks.length > 10) { this.app.toast("SELECT 5 TO 10", `You selected ${picks.length} numbers.`, "L"); return; }
    this.busy = true;
    this.drawn = [];
    this.revealed.clear();
    this.lastMatches = 0;
    this.lastPayout = 0;
    this.root.querySelector("#kenoStatus").textContent = "THE ORACLE IS DRAWING";
    this.render();
    try {
      const response = await fetch("/api/games/keno/draws", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ drawId: crypto.randomUUID(), bet: this.bet, picks })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Keno is unavailable.");
      this.drawn = payload.draw.drawn;
      for (const number of this.drawn) {
        await core.wait(this.app.profile.data.settings.reducedMotion ? 45 : 220);
        if (this.disposed) return;
        this.revealed.add(number);
        this.app.audio.play("stop");
        this.render();
      }
      this.lastMatches = payload.draw.hits;
      this.lastPayout = payload.draw.payout;
      this.root.querySelector("#kenoStatus").textContent = this.lastPayout ? `${this.lastMatches} HIT  ${core.formatL(this.lastPayout)} RETURN` : `${this.lastMatches} HIT  THE ORACLE IS SILENT`;
      window.__IRIS_RECORD_REMOTE__?.("keno",payload.draw.drawId,this.bet,payload.draw.payout||0,"ORACLE KENO",`${payload.draw.hits} HITS`);
      setWallet(payload.draw.wallet);
    } catch (error) {
      this.app.toast("KENO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.busy = false;
      this.render();
    }
  };
})();
