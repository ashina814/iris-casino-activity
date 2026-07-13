(function () {
  const app = window.__LUX_NOCTIS__;
  const cluster = document.querySelector(".wallet-cluster");
  if (!app || !cluster) return;

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
      if (!response.ok) throw new Error("wallet unavailable");
      return response.json();
    })
    .then((payload) => {
      if (!Number.isInteger(payload.wallet) || payload.wallet < 0) throw new Error("invalid wallet");
      setWallet(payload.wallet);
    })
    .catch(() => {
      value.textContent = "Unavailable";
    });
})();
