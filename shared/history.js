// Non-sensitive public browsing history only. Never store identity/session tokens here.
import { withoutMediaCapabilities } from './api.js';
export function readHistory(storage, key, limit = 20) {
  try {
    const raw = storage.getItem(key) || "[]";
    if (raw.length > 1000000) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.slice(0, limit) : [];
  } catch {
    return [];
  }
}
export function writeHistory(storage, key, entries) {
  try {
    storage.setItem(key, JSON.stringify(withoutMediaCapabilities(entries.slice(0, 20))));
  } catch {
    /* A full or disabled browser store must not break catalog navigation. */
  }
}
export function saveQuery(storage, value) {
  const q = String(value || "")
    .trim()
    .slice(0, 160);
  if (!q) return;
  const history = readHistory(storage, "mm_web_searches").filter(
    (item) => typeof item === "string" && item !== q,
  );
  writeHistory(storage, "mm_web_searches", [q, ...history]);
}
