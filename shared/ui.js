export const esc = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (value) =>
  `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} сум`;
export const $ = (selector, root = document) => root.querySelector(selector);
export const list = (values) => (Array.isArray(values) ? values : []);
export const heading = (title, subtitle = "") =>
  `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ""}</div></div>`;
export const button = (label, action, extra = "") =>
  `<button type="button" class="button" data-action="${esc(action)}" ${extra}>${esc(label)}</button>`;
export const empty = (message) =>
  `<div class="empty"><h2>${esc(message || "Здесь пока ничего нет")}</h2><p class="muted">Когда появятся данные, они будут показаны здесь.</p></div>`;
export const loading = () =>
  '<div class="empty" role="status"><span class="spinner"></span><p>Загрузка…</p></div>';
export const errorView = (error) =>
  `<div class="empty" role="alert"><h2>${error.status === 401 ? "Нужно войти" : error.status === 403 ? "Недостаточно прав" : "Не удалось загрузить данные"}</h2><p>${esc(error.message)}</p>${button(error.status === 401 ? "Войти" : "Повторить", error.status === 401 ? "login" : "retry")}</div>`;
export function field(label, name, value = "", type = "text", attrs = "") {
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
export function select(label, name, values, selected = "") {
  return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" aria-label="${esc(label)}">${values
    .map((item) => {
      const [value, text] = Array.isArray(item) ? item : [item, item];
      return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(text)}</option>`;
    })
    .join("")}</select></label>`;
}
export const textarea = (label, name, value = "") =>
  `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="4">${esc(value)}</textarea></label>`;
export function dialog(content, title = "") {
  const host = $("#modalRoot");
  const restoreFocus = document.activeElement;
  const previous = $("dialog", host);
  if (previous?.open) previous.close();
  host.innerHTML = `<dialog class="web-dialog" aria-labelledby="dialogTitle"><div class="modal-head"><h2 id="dialogTitle">${esc(title)}</h2><button type="button" class="icon-button" aria-label="Закрыть">×</button></div><div class="modal-body">${content}<p class="form-error" role="alert"></p></div></dialog>`;
  const modal = $("dialog", host);
  $(".icon-button", modal).onclick = () => modal.close();
  modal.addEventListener("close", () => {
    if (modal.parentElement === host) {
      host.innerHTML = "";
      restoreFocus?.focus();
    }
  });
  modal.showModal();
  return modal;
}
export function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  $("#toastRoot").append(el);
  setTimeout(() => el.remove(), 5000);
}
export async function submit(form, task) {
  const controls = [...form.querySelectorAll("button")];
  const disabled = controls.map((control) => control.disabled);
  form.setAttribute("aria-busy", "true");
  controls.forEach((control) => {
    control.disabled = true;
    control.setAttribute("aria-busy", "true");
  });
  const error =
    form.closest("dialog")?.querySelector(".form-error") ||
    form.querySelector(".form-error");
  if (error) error.textContent = "";
  try {
    await task(Object.fromEntries(new FormData(form)));
  } catch (exception) {
    if (error) error.textContent = exception.message;
    else toast(exception.message);
  } finally {
    form.removeAttribute("aria-busy");
    controls.forEach((control, index) => {
      control.disabled = disabled[index];
      control.removeAttribute("aria-busy");
    });
  }
}
