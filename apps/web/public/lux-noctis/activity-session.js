(function () {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("discord_id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 72);
  const displayName = (params.get("name") || "").trim().slice(0, 18);

  if (id && displayName) {
    window.LUX_ACTIVITY_USER = { id, displayName };
  }
})();
