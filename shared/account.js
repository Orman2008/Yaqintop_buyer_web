import { $, dialog, field, select, button, submit, toast } from "./ui.js";
export function editAccount(api, user, onUpdate) {
  const modal = dialog(
    `<form class="form">${field("Имя", "name", user.name, "text", 'required maxlength="100"')}${select(
      "Язык",
      "language_code",
      [
        ["ru", "Русский"],
        ["en", "English"],
        ["uz", "O‘zbekcha"],
      ],
      user.language_code,
    )}${field("Фото профиля", "avatar", "", "file", 'accept="image/jpeg,image/png,image/webp"')}<button class="button">Сохранить</button></form>`,
    "Мой аккаунт",
  );
  $("form", modal).onsubmit = (event) => {
    event.preventDefault();
    submit(event.currentTarget, async (values) => {
      const result = await api.request("/users/me/profile", {
        method: "PUT",
        body: { name: values.name, language_code: values.language_code },
      });
      if (values.avatar?.size) {
        const form = new FormData();
        form.append("avatar", values.avatar);
        await api.request("/users/me/avatar", { method: "PUT", body: form });
      }
      modal.close();
      onUpdate(
        result.user || {
          ...user,
          name: values.name,
          language_code: values.language_code,
        },
      );
    });
  };
}
export async function deleteAccount(api, onDeleted) {
  const modal = dialog(
    `<p class="notice">Удаление аккаунта необратимо. Связанные данные будут удалены по правилам Yaqintop. Сначала запросите код подтверждения.</p>${button("Получить код удаления", "request-deletion")}`,
    "Удалить аккаунт",
  );
  $("[data-action]", modal).onclick = async (event) => {
    event.currentTarget.disabled = true;
    try {
      const challenge = await api.request("/users/me/deletion/request", {
        method: "POST",
        body: {},
      });
      $(".modal-body", modal).innerHTML =
        `<form class="form">${field("Код подтверждения", "code", "", "text", `required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${Number(challenge.code_length) || 6}}"`)}<button class="button danger">Удалить аккаунт окончательно</button></form><p class="form-error" role="alert"></p>`;
      $("form", modal).onsubmit = (e) => {
        e.preventDefault();
        submit(e.currentTarget, async (values) => {
          await api.request("/users/me", {
            method: "DELETE",
            body: { code: values.code },
          });
          api.clear();
          modal.close();
          onDeleted();
        });
      };
    } catch (error) {
      $(".form-error", modal).textContent = error.message;
      event.target.disabled = false;
    }
  };
}
export function supportLinks(base, client) {
  return `<div class="actions"><a href="${base}/legal/${client}/terms" target="_blank" rel="noopener">Условия</a><a href="${base}/legal/${client}/privacy" target="_blank" rel="noopener">Конфиденциальность</a><a href="https://t.me/yaqintop_support_bot" target="_blank" rel="noopener">Поддержка</a></div>`;
}
