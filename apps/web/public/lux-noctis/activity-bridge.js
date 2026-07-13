(function () {
  const cluster = document.querySelector(".wallet-cluster");
  if (!cluster) return;

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
      value.textContent = `${new Intl.NumberFormat("ja-JP").format(payload.wallet)} Ris`;
    })
    .catch(() => {
      value.textContent = "Unavailable";
    });
})();
