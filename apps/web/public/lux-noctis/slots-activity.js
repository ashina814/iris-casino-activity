(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.SlotsGame) return;

  function setWallet(wallet) {
    if (!Number.isInteger(wallet)) return;
    const value = `${new Intl.NumberFormat("ja-JP").format(wallet)} Ris`;
    const gameWallet = document.querySelector("#balanceGame");
    if (gameWallet) { gameWallet.textContent = value; gameWallet.previousElementSibling.textContent = "IRIS WALLET"; }
    const irisWallet = document.querySelector(".iris-wallet strong");
    if (irisWallet) irisWallet.textContent = value;
  }

  core.SlotsGame.prototype.spin = async function () {
    if (this.spinning) return;
    this.spinning = true;
    this.winningLines = [];
    this.winPositions.clear();
    this.lastWin = 0;
    this.renderInfo();
    this.app.audio.play("spin");
    try {
      const response = await fetch("/api/games/slots/spins", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ spinId: crypto.randomUUID(), bet: this.bet }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Slots are unavailable.");
      const spin = payload.spin;
      const firstGrid = spin.cascades[0]?.grid || spin.grid;
      await this.animateReels(firstGrid);
      for (const step of spin.cascades) {
        this.grid = step.grid;
        this.winPositions = new Set(step.positions);
        this.renderGrid();
        document.querySelector("#cascadeBadge").hidden = false;
        document.querySelector("#cascadeBadge").textContent = `CASCADE x${step.multiplier}`;
        this.app.audio.play(step.multiplier > 2 ? "bigwin" : "win");
        await core.wait(this.app.profile.data.settings.reducedMotion ? 80 : this.turbo ? 220 : 720);
      }
      document.querySelector("#cascadeBadge").hidden = true;
      this.grid = spin.grid;
      this.winPositions.clear();
      this.freeSpins = spin.freeSpins;
      this.lastWin = spin.payout;
      this.renderGrid();
      document.querySelector("#slotWinBanner").textContent = spin.payout ? `WIN  ${core.formatL(spin.payout)}` : "NO WIN";
      document.querySelector("#slotStatus").textContent = spin.payout ? "THE VAULT PAYS OUT" : "THE VAULT WAITS";
      window.__IRIS_RECORD_REMOTE__?.("slots",spin.spinId,this.bet,spin.payout||0,"CELESTIAL VAULT",`${spin.cascades.length} CASCADES`);
      setWallet(spin.wallet);
    } catch (error) {
      this.app.toast("SLOTS UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.spinning = false;
      this.renderInfo();
    }
  };
})();
