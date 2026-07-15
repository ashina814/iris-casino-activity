(function () {
  const app = window.__LUX_NOCTIS__;
  const cluster = document.querySelector(".wallet-cluster");
  if (!app || !cluster) return;

  // Keep the legacy node for the base UI renderer, but never display its local balance in Activity mode.
  const legacyWallet = cluster.querySelector(".wallet");
  if (legacyWallet) {
    legacyWallet.hidden = true;
    legacyWallet.setAttribute("aria-hidden", "true");
  }
  app.profile.data.balance = 0;
  app.updateHud();

  function setWallet(wallet) {
    if (!Number.isInteger(wallet) || wallet < 0) return;

    app.profile.data.balance = wallet;
    app.updateHud();

    const value = `${new Intl.NumberFormat("ja-JP").format(wallet)} Ris`;
    document.querySelectorAll(".wallet small, .table-wallet small").forEach((label) => {
      label.textContent = "IRIS WALLET";
    });
    const gameWallet = document.querySelector("#balanceGame");
    if (gameWallet) gameWallet.textContent = value;
    const irisWallet = document.querySelector(".iris-wallet strong");
    if (irisWallet) irisWallet.textContent = value;
  }

  window.__IRIS_SET_WALLET = setWallet;

  const badge = document.createElement("div");
  badge.className = "iris-wallet";
  badge.title = "Read-only balance from IRIS Economy";

  const label = document.createElement("small");
  label.textContent = "IRIS WALLET";
  const value = document.createElement("strong");
  value.textContent = "Loading";
  badge.append(label, value);
  cluster.prepend(badge);

  fetch("/api/wallet", { credentials: "include" })
    .then((response) => {
      if (response.status === 401) throw new Error("authentication required");
      if (!response.ok) throw new Error("wallet unavailable");
      return response.json();
    })
    .then((payload) => {
      if (!Number.isInteger(payload.wallet) || payload.wallet < 0) throw new Error("invalid wallet");
      setWallet(payload.wallet);
    })
    .catch((error) => {
      const authenticationRequired = error instanceof Error && error.message === "authentication required";
      value.textContent = authenticationRequired ? "Discord 認証が必要" : "Unavailable";
      badge.title = authenticationRequired
        ? "Discord Activity 内で認証を完了すると RIS 残高を表示します。"
        : "IRIS Economy から RIS 残高を取得できませんでした。";
    });
})();
