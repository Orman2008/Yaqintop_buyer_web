import {
  $,
  esc,
  dialog,
  button,
  empty,
  submit,
  field,
  select,
  textarea,
} from "./ui.js";
import { mediaUrl, rows } from "./api.js";
const photo = (url, base, title) => {
  const source = mediaUrl(url, base);
  return source
    ? `<img class="cover" src="${esc(source)}" alt="${esc(title)}" loading="lazy">`
    : "";
};
export async function showPhotoNavigation(api, base, shopId) {
  const data = await api.request(`/api/v1/shops/${Number(shopId)}/navigation`);
  if (!data.enabled)
    return dialog(
      empty("Фото-маршрут пока не опубликован"),
      "Навигация по фото",
    );
  let index = 0;
  const steps = rows(data.route, "steps"),
    modal = dialog("", "Как дойти до магазина");
  function render() {
    const step = steps[index];
    $(".modal-body", modal).innerHTML =
      `<p class="muted">Шаг ${index + 1} из ${steps.length}</p>${photo(step.photo_url, base, step.title)}<h3>${esc(step.title)}</h3><p>${esc(step.description)}</p><p class="muted">${esc(step.landmark)}</p><div class="actions">${index ? button("Назад", "photo-back") : ""}${index < steps.length - 1 ? button("Далее", "photo-next") : button("Закрыть", "photo-close")}</div>`;
  }
  render();
  modal.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "photo-next" && index < steps.length - 1) index++;
    if (action === "photo-back" && index > 0) index--;
    if (action === "photo-close") modal.close();
    else if (action?.startsWith("photo-")) render();
  });
}
export async function mountPhotoEditor(container, { api, base, shopId }) {
  const path = `/api/v1/seller/shops/${Number(shopId)}/navigation`;
  let disposed = false;
  async function load() {
    const data = await api.request(path);
    if (disposed) return;
    const route = data.route || {};
    container.innerHTML = `<form data-route-form class="form card">${field("Название маршрута", "title", route.title || "Как дойти до магазина")}${textarea("Описание", "description", route.description)}${field("Вход", "entrance_name", route.entrance_name || "")}${field("Ориентир слева", "left_landmark", route.left_landmark || "")}${field("Ориентир справа", "right_landmark", route.right_landmark || "")}${textarea("Инструкция", "route_description", route.route_description)}<button class="button">Сохранить черновик</button></form><p class="notice">Статус: ${esc(route.status || "Новый")}. Для публикации нужны 3–10 шагов, каждый с фото, названием и инструкцией.</p><div class="actions">${button("Добавить шаг", "nav-step")}${button("Опубликовать", "nav-publish")}</div><div class="store-grid">${
      rows(route, "steps")
        .map(
          (step) =>
            `<article class="card">${photo(step.photo_url, base, step.title)}<h3>${Number(step.order)}. ${esc(step.title)}</h3><p>${esc(step.description)}</p>${button("Изменить", "nav-edit", `data-id="${Number(step.id)}"`)}${button("Удалить", "nav-delete", `data-id="${Number(step.id)}"`)}</article>`,
        )
        .join("") || empty("Шагов пока нет")
    }</div>`;
    const form = $("[data-route-form]", container);
    form.onsubmit = (e) => {
      e.preventDefault();
      submit(form, async (values) => {
        await api.request(path, {
          method: "POST",
          body: { ...values, status: "DRAFT" },
        });
        await load();
      });
    };
    container.onclick = async (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      try {
        if (action.dataset.action === "nav-publish") {
          await api.request(path + "/publish", { method: "POST", body: {} });
          await load();
        }
        if (action.dataset.action === "nav-delete") {
          if (!window.confirm("Удалить этот шаг фото-маршрута?")) return;
          await api.request(
            `/api/v1/seller/navigation/steps/${Number(action.dataset.id)}`,
            { method: "DELETE" },
          );
          await load();
        }
        if (["nav-edit", "nav-step"].includes(action.dataset.action)) {
          const step =
            rows(route, "steps").find(
              (s) => Number(s.id) === Number(action.dataset.id),
            ) || {};
          const modal = dialog(
            `<form class="form">${field("Название шага", "title", step.title || "", "text", "required")}${textarea("Инструкция", "description", step.description)}${field("Ориентир", "landmark", step.landmark || "")}${select("Тип", "type", ["ENTRANCE", "LANDMARK", "DIRECTION", "STORE"], step.type)}${select("Направление", "direction", ["NONE", "STRAIGHT", "LEFT", "RIGHT", "BACK", "ARRIVED"], step.direction)}${field("Порядок", "order", step.order || rows(route, "steps").length + 1, "number", 'min="1" max="10"')}${field("Фото шага", "photo", "", "file", 'accept="image/jpeg,image/png,image/webp"')}<button class="button">Сохранить шаг</button></form>`,
            "Шаг маршрута",
          );
          const f = $("form", modal);
          f.onsubmit = (e) => {
            e.preventDefault();
            submit(f, async (values) => {
              const { photo: picture, ...body } = values;
              const result = await api.request(
                step.id
                  ? `/api/v1/seller/navigation/steps/${Number(step.id)}`
                  : path + "/steps",
                { method: step.id ? "PATCH" : "POST", body },
              );
              if (picture?.size) {
                const image = new FormData();
                image.append("photo", picture);
                await api.request(
                  `/api/v1/seller/navigation/steps/${Number(step.id || result.step.id)}/photo`,
                  { method: "POST", body: image },
                );
              }
              modal.close();
              await load();
            });
          };
        }
      } catch (error) {
        dialog(
          `<p role="alert">${esc(error.message)}</p>`,
          "Не удалось изменить маршрут",
        );
      }
    };
  }
  await load();
  return () => {
    disposed = true;
    container.onclick = null;
  };
}
