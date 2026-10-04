import { $, esc, money, dialog, field, button, submit, toast } from "./ui.js";
export function sellerTransaction(api, shopId, transaction) {
  const path = `/shops/${Number(shopId)}/rewards/transactions/${Number(transaction.id)}`;
  const modal = dialog(
    `<p>Сделка ${esc(transaction.transaction_code || transaction.id)}</p><form class="form">${field("Товар или услуга", "item_name", transaction.item_name || "", "text", 'required maxlength="220"')}${field("Сумма покупки", "purchase_amount", "", "number", 'required min="1" step="1"')}${field("Скидка, %", "discount_percent", 0, "number", 'min="0" max="99"')}<button class="button">Рассчитать сумму</button></form>`,
    "QR-сделка",
  );
  const form = $("form", modal);
  form.onsubmit = (e) => {
    e.preventDefault();
    submit(form, async (values) => {
      const quote = await api.request(path + "/quote", {
        method: "PUT",
        body: values,
      });
      const row = quote.transaction;
      $(".modal-body", modal).innerHTML =
        `<h3>${esc(row.item_name)}</h3><p>Сумма: ${money(row.purchase_amount)}</p><p>Скидка: ${money(row.discount_amount)}</p><p class="price">Итого: ${money(row.final_amount)}</p>${button("Отправить покупателю на подтверждение", "qr-seller-confirm")}<p class="form-error" role="alert"></p>`;
      const control = $("[data-action=qr-seller-confirm]", modal);
      control.onclick = async () => {
        control.disabled = true;
        try {
          await api.request(path + "/seller-confirm", {
            method: "POST",
            body: {},
          });
          $(".modal-body", modal).innerHTML =
            `<p class="notice">Ожидаем подтверждение покупателя в приложении или Web Wallet.</p>${button("Обновить статус", "qr-transaction-status")}<p class="form-error" role="alert"></p>`;
          $("[data-action=qr-transaction-status]", modal).onclick =
            async () => {
              try {
                const status = await api.request(path);
                toast(`Статус: ${status.transaction.status}`);
              } catch (error) {
                $(".form-error", modal).textContent = error.message;
              }
            };
        } catch (error) {
          $(".form-error", modal).textContent = error.message;
          control.disabled = false;
        }
      };
    });
  };
}
export function buyerTransaction(api, transaction, onConfirmed) {
  const modal = dialog(
    `<p>Магазин: ${esc(transaction.shop_name)}</p><h3>${esc(transaction.item_name)}</h3><p>Скидка: ${money(transaction.discount_amount)}</p><p class="price">Итого: ${money(transaction.final_amount)}</p><p class="notice">Подтверждайте только фактическую покупку. Это существующая QR-сделка Yaqintop, не банковская онлайн-оплата.</p>${button("Подтвердить покупку", "qr-buyer-confirm")}`,
    "Подтверждение QR-сделки",
  );
  $("[data-action=qr-buyer-confirm]", modal).onclick = async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api.request(
        `/rewards/customer/transactions/${Number(transaction.id)}/confirm`,
        { method: "POST", body: {} },
      );
      modal.close();
      toast("Покупка подтверждена");
      onConfirmed();
    } catch (error) {
      $(".form-error", modal).textContent = error.message;
      event.target.disabled = false;
    }
  };
}
