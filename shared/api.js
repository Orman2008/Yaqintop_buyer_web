export class ApiError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function resolveApiBaseUrl(value, location = globalThis.location) {
  const raw = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (
    !raw &&
    location?.hostname &&
    !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  )
    throw new Error(
      "Не настроен PUBLIC_API_BASE_URL. Обратитесь к владельцу сайта.",
    );
  const url = new URL(raw || location?.origin || "http://localhost");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("PUBLIC_API_BASE_URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Invalid PUBLIC_API_BASE_URL");
  return url.href.replace(/\/+$/, "");
}
export function createApiClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeout = 15000,
  deviceId = "web-browser-session",
}) {
  const base = resolveApiBaseUrl(baseUrl);
  let access = "",
    refresh = "",
    refreshing = null,
    sessionEpoch = 0;
  async function send(
    path,
    { method = "GET", body, signal, auth = true, headers: extraHeaders = {} } = {},
    retry = true,
  ) {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid API path");
    const controller = new AbortController();
    const requestEpoch = sessionEpoch;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    try {
      const isForm =
        typeof FormData !== "undefined" && body instanceof FormData;
      const headers = { "X-Device-Id": deviceId, ...extraHeaders };
      if (auth && access) headers.Authorization = `Bearer ${access}`;
      if (body !== undefined && !isForm)
        headers["Content-Type"] = "application/json";
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body:
          body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
      });
      let data = {};
      if (response.status !== 204) {
        try {
          data = await response.json();
        } catch {
          if (response.ok)
            throw new ApiError(
              "Сервер вернул некорректный ответ. Повторите попытку.",
              502,
              "INVALID_RESPONSE",
            );
        }
      }
      if (response.status === 401 && auth && refresh && retry) {
        if (requestEpoch !== sessionEpoch)
          throw new ApiError(
            "Сессия изменилась. Повторите действие.",
            401,
            "SESSION_CHANGED",
          );
        if (!refreshing)
          refreshing = send(
            "/auth/refresh",
            { method: "POST", body: { refresh_token: refresh }, auth: false },
            false,
          )
            .then((payload) => {
              if (requestEpoch !== sessionEpoch)
                throw new ApiError("Сессия завершена.", 401, "SESSION_CHANGED");
              return setSession(payload, false);
            })
            .catch((error) => {
              if (requestEpoch === sessionEpoch) clear();
              throw error;
            })
            .finally(() => {
              refreshing = null;
            });
        await refreshing;
        return send(path, { method, body, signal, auth, headers: extraHeaders }, false);
      }
      if (!response.ok)
        throw new ApiError(
          data.error || data.message || `Ошибка ${response.status}`,
          response.status,
          data.code,
        );
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError("Запрос отменён", 0, "CANCELLED");
      throw new ApiError(
        controller.signal.aborted
          ? "Сервер отвечает слишком долго. Повторите попытку."
          : "Нет соединения с сервером. Проверьте интернет.",
        0,
        "NETWORK",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  function setSession(payload, newIdentity = true) {
    if (newIdentity) sessionEpoch++;
    access = payload.access_token || payload.token || "";
    refresh = payload.refresh_token || "";
    return payload;
  }
  function clear() {
    sessionEpoch++;
    access = "";
    refresh = "";
    clearPrivateMediaImages();
  }
  return {
    request: send,
    setSession,
    clear,
    get authenticated() {
      return Boolean(access);
    },
    async logout() {
      try {
        if (access)
          await send("/auth/logout", {
            method: "POST",
            body: { refresh_token: refresh },
          });
      } finally {
        clear();
      }
    },
  };
}
export function mediaUrl(raw, baseUrl, thumbnail = false) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    let url = new URL(value, `${baseUrl}/`);
    if (url.username || url.password) return "";
    if (/^\/media\/\d+(\/thumbnail)?$/.test(url.pathname))
      url = new URL(url.pathname + url.search, baseUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return "";
    if (thumbnail && /^\/media\/\d+$/.test(url.pathname))
      url.pathname += "/thumbnail";
    return url.href;
  } catch {
    return "";
  }
}
export const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  ).toString();
export const rows = (payload, key = "items") =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.[key])
      ? payload[key]
      : [];

export function withoutMediaCapabilities(value) {
  if (typeof value === "string" && value.includes("media_token=")) {
    try {
      const url = new URL(value, "https://media.invalid");
      url.searchParams.delete("media_token"); url.searchParams.set("private_media", "1");
      return value.startsWith("/") ? url.pathname + url.search : url.href;
    } catch { return ""; }
  }
  if(Array.isArray(value)) return value.map(withoutMediaCapabilities);
  if(value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,withoutMediaCapabilities(item)]));
  return value;
}
export function clearPrivateMediaImages(root = globalThis.document) {
  root?.querySelectorAll('img[src*="media_token="],img[src*="private_media=1"]').forEach(image => image.removeAttribute("src"));
}
export function installPrivateMediaImages({request, baseUrl, root = globalThis.document}) {
  const attempts = new WeakMap();
  const loaded = event => { if(event.target?.tagName === 'IMG') attempts.delete(event.target); };
  const listener = async event => {
    const image = event.target;
    if(image?.tagName !== "IMG") return;
    let url;
    try { url = new URL(image.src); } catch { return; }
    if(url.origin !== new URL(baseUrl).origin || !/^\/media\/\d+(?:\/thumbnail)?$/.test(url.pathname)) return;
    const original = image.src;
    if(attempts.get(image) === original) return;
    attempts.set(image,original);
    image.referrerPolicy = "no-referrer";
    try {
      const payload = await request(url.pathname.replace(/\/thumbnail$/, "") + "/access");
      if(!image.isConnected || image.src !== original) return;
      const renewed = mediaUrl(payload.url,baseUrl,url.pathname.endsWith('/thumbnail'));
      if(!renewed) return;
      attempts.set(image,renewed); image.src = renewed;
    } catch { /* Existing error presentation remains; no credentials or URL are logged. */ }
  };
  root?.addEventListener("error",listener,true);
  root?.addEventListener("load",loaded,true);
  return () => { root?.removeEventListener("error",listener,true); root?.removeEventListener("load",loaded,true); };
}
