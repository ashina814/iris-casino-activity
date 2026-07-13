(function () {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("discord_id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 72);
  const displayName = (params.get("name") || "").trim().slice(0, 18);
  const activityMode = Boolean(id && displayName);

  window.IRIS_ACTIVITY_MODE = true;
  document.documentElement.classList.add("iris-activity");

  if (activityMode) {
    window.LUX_ACTIVITY_USER = { id, displayName };
    if (params.get("autostart") === "1") {
      window.addEventListener("load", () => window.__LUX_NOCTIS__?.enterPalace());
    }
    return;
  }

  window.addEventListener("load", () => {
    const requestAuthentication = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.parent.postMessage({ type: "iris-activity-authenticate" }, "*");
    };
    document.querySelector("#enterButton")?.addEventListener("click", requestAuthentication, true);
    document.querySelector("#playerNameInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") requestAuthentication(event);
    }, true);
  });
})();
