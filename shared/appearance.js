import { dialog, esc } from "./ui.js";
export const appearanceModes = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};
const system = window.matchMedia("(prefers-color-scheme: dark)");
export function applyAppearance(mode = "system", persist = false) {
  if (!Object.hasOwn(appearanceModes, mode)) mode = "system";
  document.documentElement.dataset.themeMode = mode;
  const theme = mode === "system" ? (system.matches ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try {
      localStorage.setItem("mapmarket.appearance", mode);
    } catch {}
  }
  for (const label of document.querySelectorAll("[data-appearance-value]"))
    label.textContent = appearanceModes[mode];
}
export function appearanceSettings() {
  return `<section class="card section"><h2>Настройки</h2><h3>Оформление</h3><button type="button" class="button soft" data-appearance-open>Тема · <span data-appearance-value>${esc(appearanceModes[document.documentElement.dataset.themeMode] || appearanceModes.system)}</span></button></section>`;
}
system.addEventListener("change", () =>
  applyAppearance(document.documentElement.dataset.themeMode),
);
window.addEventListener("storage", (event) => {
  if (event.key === "mapmarket.appearance") applyAppearance(event.newValue);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-appearance-open]")) return;
  const mode = document.documentElement.dataset.themeMode || "system";
  const modal = dialog(
    `<fieldset class="form"><legend>Тема</legend>${Object.entries(
      appearanceModes,
    )
      .map(
        ([key, title]) =>
          `<label><input type="radio" name="appearance" value="${key}" ${key === mode ? "checked" : ""}> ${title}${key === "system" ? " — Использовать тему устройства" : ""}</label>`,
      )
      .join("")}</fieldset>`,
    "Оформление",
  );
  modal.addEventListener("change", (event) => {
    if (event.target.name === "appearance")
      applyAppearance(event.target.value, true);
  });
});
