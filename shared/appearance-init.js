// Runs before CSS/paint. This is a local preference, never an API credential.
(() => {
  let mode = "system";
  try {
    mode = localStorage.getItem("mapmarket.appearance") || mode;
  } catch {}
  if (!["system", "light", "dark"].includes(mode)) mode = "system";
  const dark =
    mode === "dark" ||
    (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
