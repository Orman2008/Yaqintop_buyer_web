import { dialog, field, select, button, $, submit, esc } from "./ui.js";
export const specializations = [
  ["TECH", "Техника и электроника"],
  ["CLOTHING", "Одежда"],
  ["CONSTRUCTION", "Стройматериалы"],
  ["FURNITURE", "Мебель"],
  ["RESTAURANT", "Ресторан"],
  ["COFFEE", "Кофейня"],
  ["PHARMACY", "Аптека"],
  ["GROCERY", "Продукты"],
  ["BEAUTY", "Красота"],
  ["HOME", "Дом"],
  ["HAIRDRESSER", "Парикмахерская"],
  ["GENERAL", "Другое"],
];
export function authFlow({ api, client, baseUrl, onSession, locationPicker }) {
  let phone = "",
    signupToken = "",
    staffClaimToken = "",
    channel = "telegram",
    codeLength = 6,
    disposePicker = () => {},
    staffTimer;
  const modal = dialog(
    "",
    client === "seller" ? "Кабинет продавца" : "Вход в Yaqintop",
  );
  const body = $(".modal-body", modal);
  modal.addEventListener("close", () => {
    disposePicker();
    clearInterval(staffTimer);
  });
  function render(html) {
    clearInterval(staffTimer);
    disposePicker();
    disposePicker = () => {};
    body.innerHTML = html + '<p class="form-error" role="alert"></p>';
  }
  function accept(payload) {
    api.setSession(payload);
    modal.close();
    onSession(payload);
  }
  async function request(channelValue) {
    channel = channelValue;
    const result = await api.request("/auth/passwordless/request", {
      method: "POST",
      body: { phone, client, channel },
      auth: false,
    });
    codeLength = Number(result.code_length) || 6;
    const deliveryChannel = result.delivery_channel || channel;
    render(
      `<p class="notice">Код отправлен ${deliveryChannel === "sms" ? "по SMS" : "в Telegram"} на ${esc(phone)}.</p><form class="form">${field("Код", "code", "", "text", `required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${codeLength}}" maxlength="${codeLength}"`)}<button class="button">Продолжить</button></form>${client === "buyer" && deliveryChannel === "telegram" ? '<p class="muted">Откройте чат Verification Codes.</p><a class="button soft" href="https://t.me/" target="_blank" rel="noopener">Открыть Telegram</a>' : ""}${button("Получить код через SMS", "sms")}${button("Изменить номер", "phone")}`,
    );
    $("form", body).onsubmit = (event) => {
      event.preventDefault();
      submit(event.currentTarget, async (values) => {
        const payload = await api.request("/auth/passwordless/verify", {
          method: "POST",
          body: { phone, client, code: values.code },
          auth: false,
        });
        if (!payload.registration_required) return accept(payload);
        signupToken = payload.signup_token;
        details();
      });
    };
  }
  function phonePage() {
    render(
      `<p class="muted">Один аккаунт для приложения и сайта. Сначала отправим код в Telegram.</p><form class="form">${client === "buyer" ? `<label class="field"><span>Телефон</span><div class="buyer-auth-phone"><span>+998</span><input name="phone" type="tel" value="${esc(phone.replace(/^\+998/, ""))}" required autocomplete="tel-national" inputmode="numeric" pattern="[0-9]{9}" placeholder="90 123 45 67" aria-label="Телефон"></div></label>` : field("Телефон", "phone", phone || "+998", "tel", 'required autocomplete="tel" placeholder="+998 90 123 45 67"')}<button class="button">Получить код в Telegram</button><button type="button" data-action="sms">Получить код через SMS</button></form>`,
    );
    if (client === "buyer") {
      const input = $("[name=phone]", body);
      input.oninput = () => {
        let digits = input.value.replace(/\D/g, "");
        if (digits.length > 9 && digits.startsWith("998")) digits = digits.slice(3);
        input.value = digits.slice(0, 9);
      };
    }
    $("form", body).onsubmit = (event) => {
      event.preventDefault();
      submit(event.currentTarget, async (values) => {
        phone = client === "buyer" ? "+998" + values.phone : values.phone.replace(/[^+\d]/g, "");
        if (!/^\+998\d{9}$/.test(phone))
          throw new Error("Введите +998 и 9 цифр номера.");
        await request("telegram");
      });
    };
  }
  function details() {
    render(
      `<form class="form">${field("Ваше имя", "name", "", "text", 'required maxlength="100" autocomplete="name"')}${
        client === "seller"
          ? `${select("Роль", "account_role", [
              ["owner", "Владелец магазина"],
              ["staff", "Сотрудник"],
            ])}<div data-owner>${field("Название магазина", "store_name")}${field("Адрес", "address")}${select("Сфера магазина", "specialization_code", specializations)}<div id="authPicker" class="web-map picker-map"></div><div class="form-row">${field("Широта", "latitude", "", "number", 'step="any" min="-90" max="90"')}${field("Долгота", "longitude", "", "number", 'step="any" min="-180" max="180"')}</div></div><div data-staff hidden>${field("Код магазина", "store_code", "", "text", 'placeholder="MM-…"')}</div>`
          : ""
      }<label><input type="checkbox" name="legal" required> Принимаю <a target="_blank" rel="noopener" href="${baseUrl}/legal/${client}/terms">условия</a> и <a target="_blank" rel="noopener" href="${baseUrl}/legal/${client}/privacy">политику</a></label><button class="button">Завершить регистрацию</button></form>`,
    );
    if (client === "seller") {
      $("select", body).onchange = (event) => {
        $("[data-owner]", body).hidden = event.target.value === "staff";
        $("[data-staff]", body).hidden = event.target.value !== "staff";
      };
      disposePicker =
        locationPicker?.($("#authPicker"), (point) => {
          $("[name=latitude]", body).value = point.lat;
          $("[name=longitude]", body).value = point.lng;
        }) || (() => {});
    }
    $("form", body).onsubmit = (event) => {
      event.preventDefault();
      submit(event.currentTarget, async (values) => {
        if (
          client === "seller" &&
          values.account_role === "owner" &&
          (!values.latitude || !values.longitude)
        )
          throw new Error("Выберите точку магазина на карте.");
        const payload = await api.request("/auth/passwordless/complete", {
          method: "POST",
          auth: false,
          body: {
            ...values,
            signup_token: signupToken,
            accept_privacy: true,
            accept_terms: true,
            language_code: "ru",
          },
        });
        if (payload.status === "pending_approval") {
          staffClaimToken = payload.staff_claim_token || "";
          render(
            `<p class="notice">Заявка отправлена владельцу. Держите это окно открытым до одобрения.</p>${button("Проверить статус", "staff-status", `data-id="${esc(payload.request_id)}"`)}`,
          );
          const check = async () => {
            try {
              const result = await api.request(
                `/staff-applications/${encodeURIComponent(payload.request_id)}/status`,
                { auth: false, headers: { "X-Staff-Claim-Token": staffClaimToken } },
              );
              if (!modal.open) return;
              if (result.token || result.access_token) accept(result);
              else if (result.status !== "pending") {
                $(".form-error", body).textContent =
                  `Статус: ${result.status}. При одобрении войдите по коду.`;
                clearInterval(staffTimer);
              }
            } catch (error) {
              if (modal.open)
                $(".form-error", body).textContent = error.message;
            }
          };
          staffTimer = setInterval(() => {
            if (!document.hidden) check();
          }, 8000);
          check();
          return;
        }
        accept(payload);
      });
    };
  }
  body.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    try {
      if (action.dataset.action === "phone") phonePage();
      if (action.dataset.action === "sms") {
        const input = $("[name=phone]", body);
        if (input) phone = client === "buyer" ? "+998" + input.value : input.value.replace(/[^+\d]/g, "");
        if (!/^\+998\d{9}$/.test(phone))
          throw new Error("Введите номер телефона.");
        action.disabled = true;
        await request("sms");
      }
      if (action.dataset.action === "staff-status") {
        const payload = await api.request(
          `/staff-applications/${encodeURIComponent(action.dataset.id)}/status`,
          { auth: false, headers: { "X-Staff-Claim-Token": staffClaimToken } },
        );
        if (payload.access_token || payload.token) accept(payload);
        else
          $(".form-error", body).textContent =
            payload.status === "approved"
              ? "Одобрено. Войдите по коду."
              : `Статус: ${payload.status}`;
      }
    } catch (error) {
      $(".form-error", body).textContent = error.message;
    } finally {
      action.disabled = false;
    }
  });
  phonePage();
}
