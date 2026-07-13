(function () {
  if (!window.IRIS_ACTIVITY_MODE || !window.LUX_ACTIVITY_USER) return;

  const app = window.__LUX_NOCTIS__;
  if (!app) return;

  let busy = false;

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

  request("/api/economy/daily", "GET")
    .then(applyDailyState)
    .catch(() => {});
})();
