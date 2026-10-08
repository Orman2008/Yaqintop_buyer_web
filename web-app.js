import {
  createApiClient,
  resolveApiBaseUrl,
  mediaUrl,
  query,
  rows,
} from "./shared/api.js";
import {
  $,
  esc,
  money,
  heading,
  button,
  empty,
  loading,
  errorView,
  field,
  select,
  textarea,
  dialog,
  submit,
  toast,
} from "./shared/ui.js";
import { authFlow } from "./shared/auth.js";
import { mountBuyerMap, distanceKm } from "./shared/maps.js";
import { mountChats } from "./shared/chats.js";
import { buyerTransaction } from "./shared/rewards.js";
import { showPhotoNavigation } from "./shared/photo-navigation.js";
import { editAccount, deleteAccount, supportLinks } from "./shared/account.js";
import { readHistory, writeHistory, saveQuery } from "./shared/history.js";
import { appearanceSettings } from "./shared/appearance.js";
import { mountNavigationMotion } from "./shared/motion.js";
const base = resolveApiBaseUrl(window.MAPMARKET_CONFIG?.PUBLIC_API_BASE_URL);
const api = createApiClient({
  baseUrl: base,
  deviceId: `buyer-web:${crypto.randomUUID()}`,
});
// Legacy passwords/bearer tokens are never reused or copied into the new web client.
try {
  localStorage.removeItem("mm_web_token");
  localStorage.removeItem("mm_web_user");
} catch {}
let user = null,
  route = "home",
  routeData = "",
  generation = 0,
  cleanup = () => {},
  tree = {},
  products = [],
  offset = 0,
  cursor = "",
  canMore = false,
  filters = {},
  favoriteIds = new Set(),
  mapController,
  selectedStore,
  position,
  mapStores = [],
  pendingTransaction;
function recentSearches() {
  const saved = readHistory(localStorage, "mm_web_searches").filter(
    (item) => typeof item === "string",
  );
  return saved.length
    ? '<section class="section"><h2>Последние поиски</h2><div class="actions">' +
        saved
          .map((q) => button(q, "recent-query", 'data-query="' + esc(q) + '"'))
          .join("") +
        "</div></section>"
    : "";
}
function bindFilters() {
  $("#filters")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    filters = {
      ...filters,
      ...Object.fromEntries(new FormData(form)),
      in_stock: form.elements.in_stock?.checked,
    };
    go();
  });
}
const nav = [
  ["home", "Главная"],
  ["categories", "Категории"],
  ["map", "Карта"],
  ["favorites", "Избранное"],
  ["chats", "Чаты"],
  ["profile", "Профиль"],
];
$("#app").outerHTML =
  `<a class="skip-link" href="#view">К содержимому</a><div class="web-shell"><aside class="web-sidebar"><a class="web-brand" href="#home"><img src="assets/yaqintop-buyer-transparent.png" alt="YAQINTOP MARKET"><span>YAQINTOP MARKET<br><small class="muted">Покупателям</small></span></a><nav aria-label="Основная навигация">${nav.map(([key, title]) => `<a href="#${key}" data-nav="${key}">${title}</a>`).join("")}</nav><div class="sidebar-footer">${supportLinks(base, "buyer")}<a href="../seller/">Продавцам →</a></div></aside><main class="web-main"><header class="web-header"><form id="searchForm" class="toolbar" style="margin:0;flex:1"><label class="visually-hidden" for="webSearch">Поиск товаров</label><input id="webSearch" name="q" placeholder="Искать товары и категории" autocomplete="off"><button class="button">Найти</button></form><a href="#notifications" aria-label="Уведомления">Уведомления</a></header><section id="view" class="web-content" aria-live="polite"></section></main></div>`;
const img = (url, alt, thumb = false) => {
  const source = mediaUrl(url, base, thumb);
  return source
    ? `<img class="cover" src="${esc(source)}" alt="${esc(alt)}" loading="lazy" decoding="async">`
    : '<div class="cover" role="img" aria-label="Фото отсутствует"></div>';
};
function card(product, master = false) {
  const id = Number(product.id);
  const title = product.title || product.canonical_name || "Товар";
  return `<article class="product-card">${img(product.canonical_image_url || product.image_url, title, true)}<h3><a href="#${master ? "master" : "product"}/${id}">${esc(title)}</a></h3><p class="muted">${esc(product.leaf_category || product.category)}</p><div class="price">${master ? "от " : ""}${money(product.min_price ?? product.price)}</div><p class="muted">${master ? `${Number(product.offers_count) || 0} предложений` : `${esc(product.shop_name || "")} · ★ ${Number(product.product_average_rating || 0).toFixed(1)}`}</p>${master ? "" : button(favoriteIds.has(id) ? "Убрать из избранного" : "В избранное", "favorite", `data-id="${id}" `)}</article>`;
}
const grid = (items, master = false) =>
  items.length
    ? `<div class="product-grid">${items.map((item) => card(item, master)).join("")}</div>`
    : empty("Товары не найдены");
function login(after = () => go(route, routeData)) {
  authFlow({
    api,
    client: "buyer",
    baseUrl: base,
    onSession: async (payload) => {
      user = payload.user;
      try {
        favoriteIds = new Set(
          rows(await api.request("/users/me/favorites")).map((p) =>
            Number(p.id),
          ),
        );
      } catch (error) {
        toast(error.message);
      }
      after();
    },
  });
}
function gate(action) {
  const safe = () =>
    Promise.resolve()
      .then(action)
      .catch((error) => toast(error.message));
  if (api.authenticated) {
    safe();
    return true;
  }
  login(safe);
  return false;
}
function linkStore(store) {
  const distance =
    position && store.latitude && store.longitude
      ? distanceKm(position, {
          lat: Number(store.latitude),
          lng: Number(store.longitude),
        }).toFixed(1) + " км"
      : "";
  return `<button class="card" data-action="store" data-id="${Number(store.id)}"><b>${esc(store.name)}</b><p class="muted">${esc(store.address)} ${esc(distance)}</p></button>`;
}
async function categories(path = "") {
  if (!Object.keys(tree).length)
    tree = await api.request("/products/category-tree");
  const parts = path ? path.split("|") : [];
  let current = tree;
  for (const part of parts) current = current[part] || {};
  const keys = Array.isArray(current) ? current : Object.keys(current);
  return `${heading(parts.at(-1) || "Категории")}<div class="category-grid">${keys.map((key) => `<button class="category-card" data-action="category" data-path="${esc([...parts, key].join("|"))}"><span aria-hidden="true">▦</span>${esc(key)}</button>`).join("")}</div>${parts.length ? button("Все товары раздела", "category-products", `data-path="${esc(path)}"`) : ""}`;
}
function filtersMarkup() {
  const search = route === "search";
  const options = search
    ? [
        ["relevance", "Рекомендуемые"],
        ["price", "Сначала дешевле"],
        ...(position ? [["distance", "Сначала ближе"]] : []),
      ]
    : [
        ["", "Рекомендуемые"],
        ["price_asc", "Сначала дешевле"],
        ["price_desc", "Сначала дороже"],
        ["rating", "По рейтингу"],
        ["new", "Сначала новые"],
      ];
  return `<form id="filters" class="toolbar">${field("Цена от", "min_price", filters.min_price || "", "number", 'min="0"')}${field("Цена до", "max_price", filters.max_price || "", "number", 'min="0"')}${select(
    "Сортировка",
    "sort",
    options,
    filters.sort,
  )}${search ? `<label><input type="checkbox" name="in_stock" ${filters.in_stock !== false ? "checked" : ""}>В наличии</label>` : ""}<button class="button">Применить</button></form>`;
}
async function catalogue(append = false) {
  const requestGeneration = generation;
  if (
    route === "search" &&
    !["price", "distance", "relevance"].includes(filters.sort)
  )
    filters.sort = filters.sort === "price_asc" ? "price" : "relevance";
  if (
    route !== "search" &&
    !["price_asc", "price_desc", "rating", "new", ""].includes(filters.sort)
  )
    filters.sort = filters.sort === "price" ? "price_asc" : "";
  const params = { lang: "ru", limit: 24, ...filters };
  if (position)
    Object.assign(params, { latitude: position.lat, longitude: position.lng });
  let page;
  if (route === "search") {
    page = await api.request(
      `/search/v2?${query({ ...params, q: routeData, cursor: append ? cursor : "" })}`,
    );
    cursor = page.next_cursor || "";
    canMore = Boolean(cursor);
  } else {
    delete params.in_stock;
    if (params.sort === "price") params.sort = "price_asc";
    if (["distance", "relevance"].includes(params.sort)) delete params.sort;
    page = await api.request(
      `/products?${query({ ...params, offset: append ? offset : 0, ...(route === "store" ? { shop_id: routeData } : {}) })}`,
    );
    canMore = rows(page).length === 24;
  }
  if (requestGeneration !== generation) throw new Error("Запрос устарел");
  products = append
    ? [...new Map([...products, ...rows(page)].map((p) => [p.id, p])).values()]
    : rows(page);
  offset = products.length;
  return `${heading(route === "search" ? "Результаты поиска" : route === "store" ? "Товары магазина" : "Каталог товаров", route === "search" ? routeData : "")}<div class="actions">${route === "search" ? button("Моё местоположение", "locate") : ""}<a href="#map">На карте</a></div>${filtersMarkup()}${grid(products, route === "search")}${canMore ? button("Показать ещё", "more") : ""}`;
}
async function detail(id, master = false) {
  const product = await api.request(
    `/${master ? "master-products" : "products"}/${Number(id)}`,
  );
  if (!master) {
    const previous = readHistory(localStorage, "mm_web_recent");
    writeHistory(localStorage, "mm_web_recent", [
      product,
      ...previous.filter((p) => p && Number(p.id) !== Number(id)),
    ]);
  }
  const images = [
    ...new Set(
      [
        ...(Array.isArray(product.image_urls) ? product.image_urls : []),
        product.canonical_image_url || product.image_url,
      ].filter(Boolean),
    ),
  ];
  const offers = rows(product, "offers")
    .map(
      (offer) =>
        `<article class="card"><b>${esc(offer.shop_name)}</b><p>${money(offer.price)} · ${offer.in_stock ? "В наличии" : "Нет в наличии"}</p><a href="#product/${Number(offer.product_id)}">Открыть предложение</a>${button("Магазин", "store", `data-id="${Number(offer.shop_id)}"`)}</article>`,
    )
    .join("");
  const actions = master
    ? "<h2>Предложения магазинов</h2>" +
      (offers || empty("Предложений пока нет"))
    : `<div class="actions">${button("Магазин", "store", `data-id="${Number(product.shop_id)}"`)}${button("Чат", "start-chat", `data-id="${Number(product.shop_id)}"`)}${button("В избранное", "favorite", `data-id="${Number(id)}"`)}${button("Отзывы", "reviews", `data-id="${Number(id)}"`)}</div>`;
  return `${heading(product.title || product.canonical_name)}<div class="detail-grid"><div>${img(images[0], product.title || product.canonical_name)}<div class="gallery">${images.map((url) => img(url, "Фото товара")).join("")}</div></div><div class="card"><div class="price">${money(product.price || product.offers?.[0]?.price)}</div><p>${esc(product.description || "Описание пока не добавлено")}</p><p class="muted">${esc(product.brand || "")} ${esc(product.model || "")} ${esc(product.barcode || product.gtin || "")}</p>${actions}</div></div>`;
}
async function store(id) {
  const requestGeneration = generation;
  const fetchedStore = await api.request(`/shops/${Number(id)}`);
  if (requestGeneration !== generation) throw new Error("Запрос устарел");
  selectedStore = fetchedStore;
  if (!selectedStore) throw new Error("Магазин не найден");
  let subscribed = false;
  if (api.authenticated)
    subscribed = (await api.request(`/shops/${id}/subscription`)).subscribed;
  const markup = await catalogue();
  return `${heading(selectedStore.name, selectedStore.address)}<div class="actions">${button(subscribed ? "Отписаться" : "Подписаться", "subscribe", `data-id="${id}" data-saved="${subscribed}"`)}${button("Отзывы", "store-reviews", `data-id="${id}"`)}${button("Чат", "start-chat", `data-id="${id}"`)}${button("Маршрут", "store-map")}${button("Навигация по фото", "photo-route", `data-id="${id}"`)}</div><div class="card"><p>${esc(selectedStore.description || "")}</p><p class="muted">${esc(selectedStore.working_hours || "")} · ${esc(selectedStore.phone || "")}</p></div>${markup}`;
}
async function reviews(id, shop = false) {
  const path = shop ? `/shops/${id}/reviews` : `/products/${id}/reviews`;
  const data = await api.request(path);
  const modal = dialog(
    `${
      rows(data, "reviews")
        .map(
          (r) =>
            `<article class="card"><b>${esc(r.buyer_name || "Покупатель")} · ${Number(r.rating)} ★</b><p>${esc(r.text)}</p></article>`,
        )
        .join("") || empty("Отзывов пока нет")
    }${shop ? '<p class="muted">Отзывы магазина собраны из отзывов на товары. Оставьте отзыв в карточке товара.</p>' : `<form class="form">${select("Оценка", "rating", ["5", "4", "3", "2", "1"])}${textarea("Ваш отзыв", "text")}<button class="button">Оставить отзыв</button></form>`}`,
    "Отзывы",
  );
  if (!shop)
    $("form", modal).onsubmit = (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      gate(() =>
        submit(form, async (values) => {
          await api.request(path, {
            method: "POST",
            body: { ...values, rating: Number(values.rating) },
          });
          modal.close();
          toast("Отзыв отправлен");
        }),
      );
    };
}
async function wallet() {
  const [data, pending] = await Promise.all([
    api.request("/users/me/subscriptions"),
    api.request("/rewards/customer/pending"),
  ]);
  pendingTransaction = pending.transaction;
  return `${heading("Digital Wallet", "Скидки, талоны и гарантии")}${button("Показать QR", "qr")}${pendingTransaction ? button("Подтвердить QR-покупку", "pending-purchase") : ""}${[
    "loyalty_cards",
    "discounts",
    "warranties",
    "offers",
  ]
    .map(
      (key, index) =>
        `<section class="section"><h2>${["Талоны", "Скидки", "Гарантии", "Предложения"][index]}</h2><div class="store-grid">${
          rows(data, key)
            .map(
              (item) =>
                `<article class="card">${img(item.image_url || item.design_image_url || item.program?.image_url, item.title || item.shop_name)}<h3>${esc(item.title || item.product_name || item.shop_name)}</h3><p>${esc(item.description || item.status || "")}</p></article>`,
            )
            .join("") || empty()
        }</div></section>`,
    )
    .join("")}`;
}
async function profile() {
  return `${heading("Мой профиль")}${api.authenticated ? `<div class="card"><h2>${esc(user.name)}</h2><p>${esc(user.phone)}</p><div class="actions">${button("Редактировать", "account")}${button("Интересы", "interests")}<a href="#wallet">Кошелёк</a><a href="#subscribed">Подписки</a>${button("Выйти", "logout")}${button("Удалить аккаунт", "delete-account")}</div></div>` : `<div class="card"><h2>Откройте больше возможностей</h2><p>Избранное, чаты и кошелёк доступны после входа.</p>${button("Войти по коду", "login")}</div>`}${appearanceSettings()}<section class="section">${supportLinks(base, "buyer")}</section>`;
}
async function go(next = route, data = routeData) {
  route = next;
  routeData = data;
  const version = ++generation;
  cleanup();
  cleanup = () => {};
  mapController = null;
  document.title = `${nav.find((item) => item[0] === route)?.[1] || "YAQINTOP MARKET"} · YAQINTOP MARKET`;
  for (const item of document.querySelectorAll("[data-nav]"))
    item.classList.toggle("active", item.dataset.nav === route);
  $("#view").innerHTML = loading();
  if (
    ["favorites", "chats", "notifications", "wallet", "subscribed"].includes(
      route,
    ) &&
    !api.authenticated
  ) {
    $("#view").innerHTML =
      `${heading("Войдите, чтобы продолжить")}${button("Войти по коду", "login")}`;
    return;
  }
  try {
    let html = "";
    if (route === "home") {
      products = rows(
        await api.request(
          api.authenticated
            ? "/products/recommendations?lang=ru"
            : "/products?limit=24",
        ),
      );
      html = `<section class="buyer-home-hero"><div><p class="eyebrow">YAQINTOP MARKET</p><h1>Находите лучшие товары рядом</h1><p>Сравнивайте цены, открывайте магазины на карте и прокладывайте маршрут.</p><div class="actions"><a class="button" href="#categories">Смотреть каталог</a><a class="button" href="#map">Открыть карту</a></div></div><img class="buyer-home-logo" src="assets/yaqintop-buyer-transparent.png" alt="Логотип YAQINTOP MARKET"></section><div class="actions">${button("Моё местоположение", "locate")}</div>${recentSearches()}<section class="section"><h2>Рекомендации</h2>${grid(products)}</section><section class="section"><h2>Последние просмотры</h2><div id="recentProducts">${loading()}</div></section>`;
    } else if (route === "categories") html = await categories(data);
    else if (["catalog", "search"].includes(route)) html = await catalogue();
    else if (route === "product" || route === "master")
      html = await detail(data, route === "master");
    else if (route === "store") html = await store(Number(data));
    else if (route === "favorites") {
      const items = rows(await api.request("/users/me/favorites"));
      favoriteIds = new Set(items.map((p) => Number(p.id)));
      html = heading("Избранное") + grid(items);
    } else if (route === "profile") html = await profile();
    else if (route === "wallet") html = await wallet();
    else if (route === "subscribed")
      html =
        heading("Подписки на магазины") +
        `<div class="store-grid">${
          rows(await api.request("/users/me/subscribed-shops"))
            .map(linkStore)
            .join("") || empty()
        }</div>`;
    else if (route === "notifications") {
      const data = await api.request("/users/me/notifications");
      html =
        heading("Уведомления") +
        button("Отметить всё прочитанным", "read-notifications") +
        rows(data, "notifications")
          .map(
            (n) =>
              `<article class="card"><h3>${esc(n.shop_name)}</h3>${img(n.image_url || n.media_url, "Фото рассылки")}<p>${esc(n.text)}</p>${button("Магазин", "store", `data-id="${n.shop_id}"`)}</article>`,
          )
          .join("");
      if (!rows(data, "notifications").length)
        html += empty("Уведомлений пока нет");
    } else if (route === "map")
      html = `${heading("Магазины на карте")}<div class="toolbar">${button("Моё местоположение", "map-locate")}${button("Пешком", "route-foot")}${button("На машине", "route-driving")}<span id="routeSummary" role="status"></span></div><div class="map-layout"><div id="mapResults" class="map-results">${loading()}</div><div id="buyerMap" class="web-map" aria-label="Карта магазинов"></div></div>`;
    else if (route === "chats")
      html = heading("Чаты") + '<div id="chatView"></div>';
    else html = empty("Страница не найдена");
    if (version !== generation) return;
    $("#view").innerHTML = html;
    document.title = `${$("#view h1")?.textContent || "Покупателям"} — YAQINTOP MARKET`;
    if (route === "map") {
      mapController = mountBuyerMap($("#buyerMap"), {
        api,
        onStores: (shops) => {
          mapStores = shops;
          $("#mapResults").innerHTML =
            shops.map(linkStore).join("") ||
            empty("В этой области магазинов нет");
        },
        onSelect: (shop) => {
          selectedStore = shop;
          $("#routeSummary").innerHTML =
            `${esc(shop.name)} · <a href="#store/${Number(shop.id)}">Открыть магазин</a>`;
        },
        onError: (error) => ($("#mapResults").innerHTML = errorView(error)),
      });
      const mounted = mapController;
      cleanup = () => mounted?.destroy();
      if (selectedStore) mapController.choose(selectedStore);
    }
    if (route === "chats") {
      const dispose = await mountChats($("#chatView"), {
        api,
        baseUrl: base,
        role: "buyer",
        initialChat: data ? Number(data) : undefined,
      });
      if (version !== generation) dispose();
      else cleanup = dispose;
    }
    if (route === "home") refreshRecent(version);
    $("#filters")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      filters = {
        ...filters,
        ...values,
        in_stock: event.currentTarget.elements.in_stock?.checked,
      };
      go();
    });
  } catch (error) {
    if (version === generation) $("#view").innerHTML = errorView(error);
  }
}
async function refreshRecent(version) {
  try {
    const saved = readHistory(localStorage, "mm_web_recent").filter(
      (p) => p && Number.isSafeInteger(Number(p.id)) && Number(p.id) > 0,
    );
    const live = await Promise.all(
      saved.map(async (p) => {
        try {
          return await api.request(`/products/${Number(p.id)}`);
        } catch (error) {
          return error.status === 404 || error.status === 410 ? null : p;
        }
      }),
    );
    const result = live.filter(Boolean);
    writeHistory(localStorage, "mm_web_recent", result);
    if (version === generation && $("#recentProducts"))
      $("#recentProducts").innerHTML = grid(result);
  } catch {
    if ($("#recentProducts")) $("#recentProducts").innerHTML = empty();
  }
}
function href(next, data = "") {
  return `#${next}${data !== "" ? "/" + encodeURIComponent(data) : ""}`;
}
function navigate(next, data = "") {
  const value = href(next, data);
  if (location.hash === value) go(next, data);
  else location.hash = value;
}
let searchTimer,
  searchGeneration = 0;
$("#webSearch").setAttribute("list", "searchHints");
$("#searchForm").insertAdjacentHTML(
  "beforeend",
  '<datalist id="searchHints"></datalist>',
);
$("#webSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("#webSearch").value.trim(),
    version = ++searchGeneration;
  if (q.length < 2) {
    $("#searchHints").innerHTML = "";
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const hints = rows(
        await api.request(`/search/suggestions?${query({ q, lang: "ru" })}`),
      );
      if (version === searchGeneration)
        $("#searchHints").innerHTML = hints
          .slice(0, 8)
          .map(
            (h) =>
              `<option value="${esc(h.localized_value || h.label || h.value)}"></option>`,
          )
          .join("");
    } catch {}
  }, 350);
});
document.addEventListener("click", async (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const action = element.dataset.action,
    id = Number(element.dataset.id);
  try {
    if (action === "recent-query") {
      saveQuery(localStorage, element.dataset.query);
      filters = {};
      return navigate("search", element.dataset.query);
    }
    if (action === "retry") return go();
    if (action === "login") return login();
    if (action === "category") {
      const path = element.dataset.path;
      const count = path.split("|").length;
      if (count >= 3) {
        filters = {
          category: path.split("|")[0],
          sub_category: path.split("|")[1],
          leaf_category: path.split("|")[2],
        };
        navigate("catalog");
      } else navigate("categories", path);
    }
    if (action === "category-products") {
      const parts = element.dataset.path.split("|");
      filters = { category: parts[0], sub_category: parts[1] };
      navigate("catalog");
    }
    if (action === "store")
      return route === "map"
        ? mapController.choose(mapStores.find((shop) => Number(shop.id) === id))
        : navigate("store", id);
    if (action === "photo-route") return showPhotoNavigation(api, base, id);
    if (action === "read-notifications") {
      await api.request("/users/me/notifications/read-all", {
        method: "PUT",
        body: {},
      });
      return go();
    }
    if (action === "store-map") {
      navigate("map");
      return;
    }
    if (action === "more") {
      element.disabled = true;
      const requestGeneration = generation;
      const markup = await catalogue(true);
      if (requestGeneration === generation) {
        $("#view").innerHTML = markup;
        bindFilters();
      }
      return;
    }
    if (action === "favorite") {
      const remove = api.authenticated && favoriteIds.has(id);
      return gate(async () => {
        const saved = remove;
        if (!remove && favoriteIds.has(id)) {
          element.textContent = "Убрать из избранного";
          return;
        }
        await api.request(`/users/me/favorites/${id}`, {
          method: saved ? "DELETE" : "POST",
          body: saved ? undefined : {},
        });
        saved ? favoriteIds.delete(id) : favoriteIds.add(id);
        element.textContent = saved ? "В избранное" : "Убрать из избранного";
      });
    }
    if (action === "subscribe")
      return gate(async () => {
        await api.request(`/shops/${id}/subscription`, {
          method: element.dataset.saved === "true" ? "DELETE" : "POST",
          body: {},
        });
        go();
      });
    if (action === "start-chat")
      return gate(async () => {
        const chat = await api.request("/chats", {
          method: "POST",
          body: { shop_id: id },
        });
        navigate("chats", chat.chat_id || chat.id);
      });
    if (action === "reviews" || action === "store-reviews")
      return reviews(id, action === "store-reviews");
    if (action === "logout") {
      await api.logout();
      user = null;
      favoriteIds.clear();
      navigate("home");
    }
    if (action === "account")
      editAccount(api, user, (updated) => {
        user = updated;
        go();
      });
    if (action === "delete-account")
      deleteAccount(api, () => {
        user = null;
        navigate("home");
      });
    if (action === "locate") {
      position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          reject,
          { timeout: 15000 },
        ),
      );
      toast("Местоположение обновлено");
      go();
    }
    if (action === "map-locate") position = await mapController.locate();
    if (action.startsWith("route-"))
      $("#routeSummary").textContent = await mapController.route(
        action === "route-driving" ? "driving" : "foot",
      );
    if (action === "pending-purchase" && pendingTransaction)
      return buyerTransaction(api, pendingTransaction, () => go());
    if (action === "qr") {
      const data = await api.request("/rewards/customer/qr");
      const modal = dialog(
        '<canvas id="buyerQr" aria-label="QR покупателя"></canvas><p>QR действует ограниченное время. Для обновления откройте его снова.</p>',
        "Ваш QR",
      );
      if (!window.QRCode?.toCanvas) throw new Error("Библиотека QR недоступна");
      window.QRCode.toCanvas($("#buyerQr", modal), data.qr_token, {
        width: 240,
      });
    }
    if (action === "interests") {
      const preferences = await api.request("/users/me/preferences");
      if (preferences.completed)
        return dialog(
          '<p class="notice">Интересы уже сохранены. Изменение не предусмотрено действующим API.</p>' +
            rows(preferences, "categories")
              .map((category) => "<p>" + esc(category) + "</p>")
              .join(""),
          "Мои интересы",
        );
      if (!Object.keys(tree).length)
        tree = await api.request("/products/category-tree");
      const modal = dialog(
        '<form class="form checks"><p>Выберите ровно три категории.</p>' +
          Object.keys(tree)
            .map(
              (category) =>
                '<label><input type="checkbox" name="category" value="' +
                esc(category) +
                '">' +
                esc(category) +
                "</label>",
            )
            .join("") +
          '<button class="button">Сохранить</button></form>',
        "Мои интересы",
      );
      const form = $("form", modal);
      form.onsubmit = (event) => {
        event.preventDefault();
        submit(form, async () => {
          const categories = new FormData(form).getAll("category");
          if (categories.length !== 3)
            throw new Error("Выберите три категории");
          await api.request("/users/me/preferences", {
            method: "POST",
            body: { categories },
          });
          modal.close();
        });
      };
    }
  } catch (error) {
    toast(error.message);
  }
});
$("#searchForm").onsubmit = (event) => {
  event.preventDefault();
  filters = {};
  saveQuery(localStorage, $("#webSearch").value);
  navigate("search", $("#webSearch").value.trim());
};
$(".skip-link").onclick = (event) => {
  event.preventDefault();
  $("#view").tabIndex = -1;
  $("#view").focus();
};
mountNavigationMotion(document.querySelector(".web-sidebar nav"));
window.addEventListener("hashchange", () => {
  const [next, ...data] = location.hash.slice(1).split("/");
  go(next || "home", decodeURIComponent(data.join("/")));
});
window.addEventListener("online", () =>
  toast("Соединение восстановлено. Можно повторить запрос."),
);
window.addEventListener("offline", () =>
  toast("Нет соединения. Данные могут быть недоступны."),
);
const [initial, ...data] = location.hash.slice(1).split("/");
go(initial || "home", decodeURIComponent(data.join("/")));
