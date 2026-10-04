import {
  $,
  esc,
  field,
  textarea,
  submit,
  toast,
  empty,
  errorView,
  loading,
} from "./ui.js";
import { mediaUrl, rows } from "./api.js";
export async function mountChats(
  container,
  { api, baseUrl, role, initialChat, threadQuery },
) {
  const threads = rows(await api.request("/chats"+(threadQuery?"?"+new URLSearchParams(threadQuery):"")));
  let active = initialChat,
    timer,
    disposed = false,
    generation = 0,
    currentMessages = [],
    refreshing = false,
    hasOlder = false;
  const messageMarkup = (messages) =>
    messages
      .map(
        (message) =>
          `<div class="message ${message.sender === role ? "mine" : ""}">${message.media_url ? `<img src="${esc(mediaUrl(message.media_url, baseUrl))}" alt="Фото в сообщении" loading="lazy">` : ""}<div>${esc(message.text)}</div><time>${esc(message.time)}</time></div>`,
      )
      .join("") || "<p>Начните разговор</p>";
  async function refreshMessages(older = false) {
    if (disposed || !active || refreshing || !$(".messages", container)) return;
    refreshing = true;
    const version = generation;
    try {
      const before =
        older && currentMessages.length ? Number(currentMessages[0].id) : 0;
      const messages = rows(
        await api.request(
          `/chats/${active}/messages?limit=50${before ? "&before_id=" + before : ""}`,
        ),
        "messages",
      );
      if (disposed || version !== generation) return;
      currentMessages = [
        ...new Map(
          [...currentMessages, ...messages].map((message) => [
            Number(message.id),
            message,
          ]),
        ).values(),
      ].sort((a, b) => Number(a.id) - Number(b.id));
      if (older) hasOlder = messages.length === 50;
      const log = $(".messages", container),
        bottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 50;
      log.innerHTML = messageMarkup(currentMessages);
      if (!older && bottom) log.scrollTop = log.scrollHeight;
      $("[data-chat-older]", container).hidden = !hasOlder;
      $("[data-chat-status]", container).textContent = "";
    } catch (error) {
      if (!disposed && $("[data-chat-status]", container))
        $("[data-chat-status]", container).textContent = error.message;
    } finally {
      refreshing = false;
    }
  }
  container.innerHTML = `<div class="chat-layout"><aside class="chat-threads">${threads.map((chat) => `<button class="card" data-thread="${Number(chat.chat_id || chat.id)}"><b>${esc((role === "seller" ? chat.buyer_name || chat.customer_name : chat.shop_name) || "Диалог")}</b><p class="muted">${esc(chat.last_message)}</p>${chat.branch_code?`<small>${esc(chat.branch_name)} · ${esc(chat.branch_code)}</small>`:""}</button>`).join("") || empty("Диалогов пока нет")}</aside><section id="chatRoom" class="card">${empty("Выберите диалог")}</section></div>`;
  async function open(id) {
    active = id;
    const version = ++generation;
    currentMessages = [];
    $("#chatRoom", container).innerHTML = loading();
    let data, block;
    try {
      [data, block] = await Promise.all([
        api.request(`/chats/${id}/messages?limit=50`),
        api.request(`/chats/${id}/block`),
      ]);
    } catch (error) {
      if (!disposed && version === generation)
        $("#chatRoom", container).innerHTML = errorView(error);
      return;
    }
    if (disposed || version !== generation) return;
    const messages = rows(data, "messages");
    currentMessages = messages;
    hasOlder = messages.length === 50;
    $("#chatRoom", container).innerHTML =
      `<div class="actions"><button class="button soft" data-chat-refresh>Обновить</button><button class="button soft" data-block>${block.blocked_by_me ? "Разблокировать" : "Заблокировать"}</button></div><div class="messages" role="log" aria-label="Сообщения">${messages.map((message) => `<div class="message ${message.sender === role ? "mine" : ""}">${message.media_url ? `<img src="${esc(mediaUrl(message.media_url, baseUrl))}" alt="Фото в сообщении" loading="lazy">` : ""}<div>${esc(message.text)}</div><time>${esc(message.time)}</time></div>`).join("") || "<p>Начните разговор</p>"}</div><form class="form">${textarea("Сообщение", "text")}${field("Приложить фото", "image", "", "file", 'accept="image/jpeg,image/png,image/webp"')}<button class="button">Отправить</button><p class="form-error" role="alert"></p></form>`;
    $(".actions", container).insertAdjacentHTML(
      "beforeend",
      '<button type="button" class="button soft" data-chat-older>Ранее</button><span data-chat-status role="status"></span>',
    );
    $("[data-chat-older]", container).hidden = !hasOlder;
    $("[data-chat-older]", container).onclick = () => refreshMessages(true);
    const log = $(".messages", container);
    log.scrollTop = log.scrollHeight;
    $("[data-chat-refresh]", container).onclick = () => refreshMessages();
    $("[data-block]", container).onclick = () =>
      api
        .request(`/chats/${id}/block`, {
          method: block.blocked_by_me ? "DELETE" : "PUT",
          body: {},
        })
        .then(() => {
          if (disposed || version !== generation) return;
          block.blocked_by_me = !block.blocked_by_me;
          $("[data-block]", container).textContent = block.blocked_by_me
            ? "Разблокировать"
            : "Заблокировать";
        })
        .catch((error) => toast(error.message));
    $("form", container).onsubmit = (event) => {
      event.preventDefault();
      submit(event.currentTarget, async (values) => {
        if (!values.text.trim() && !values.image?.size)
          throw new Error("Введите сообщение или приложите фото.");
        let media_url = "";
        if (values.image?.size) {
          const form = new FormData();
          form.append("image", values.image);
          const upload = await api.request("/upload", {
            method: "POST",
            body: form,
          });
          media_url = upload.url || upload.media_url;
        }
        await api.request(`/chats/${id}/messages`, {
          method: "POST",
          body: { text: values.text, media_url },
        });
        if (disposed || version !== generation) return;
        $("form", container).reset();
        await refreshMessages();
      });
    };
  }
  for (const button of container.querySelectorAll("[data-thread]"))
    button.onclick = () =>
      open(Number(button.dataset.thread)).catch((error) =>
        toast(error.message),
      );
  if (initialChat) await open(initialChat);
  // Only messages change during foreground refresh. Text/file drafts remain untouched.
  timer = setInterval(() => {
    if (!document.hidden) refreshMessages();
  }, 10000);
  return () => {
    disposed = true;
    generation++;
    clearInterval(timer);
  };
}
