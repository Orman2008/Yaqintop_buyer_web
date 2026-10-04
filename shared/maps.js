import { query, rows } from "./api.js";
import { esc, money } from "./ui.js";
export function validPoint(lat, lng) {
  return (
    lat !== null &&
    lat !== undefined &&
    lat !== "" &&
    lng !== null &&
    lng !== undefined &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180 &&
    !(Number(lat) === 0 && Number(lng) === 0)
  );
}
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  return (
    6371 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2,
      ),
    )
  );
}
export function clusterStores(stores, project, cellSize = 80) {
  const groups = new Map();
  for (const store of stores.filter((s) =>
    validPoint(s.latitude, s.longitude),
  )) {
    const point = project(Number(store.latitude), Number(store.longitude));
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(store);
  }
  return [...groups.values()];
}
export function locationPicker(element, onPick, current) {
  if (!globalThis.L) {
    element.textContent = "Карта недоступна. Введите координаты вручную.";
    return () => {};
  }
  const point =
    current && validPoint(current.lat ?? current[0], current.lng ?? current[1])
      ? current
      : null;
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView(point || [41.3111, 69.2797], 14);
  let marker;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  map.on("click", (event) => {
    marker?.remove();
    marker = L.marker(event.latlng).addTo(map);
    onPick(event.latlng);
  });
  if (point) marker = L.marker(point).addTo(map);
  const timer = setTimeout(() => map.invalidateSize(), 100);
  return () => {
    clearTimeout(timer);
    map.remove();
  };
}
export function mountBuyerMap(element, { api, onStores, onSelect, onError }) {
  if (!globalThis.L)
    throw new Error(
      "Карта не загрузилась. Проверьте соединение и повторите попытку.",
    );
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([41.3111, 69.2797], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  const markers = L.layerGroup().addTo(map);
  let shops = [],
    timer,
    version = 0,
    selected,
    route,
    gps,
    gpsMarker,
    destroyed = false;
  function redraw() {
    markers.clearLayers();
    for (const group of clusterStores(
      shops.filter((s) => s.id !== selected?.id),
      (lat, lng) => map.project([lat, lng], map.getZoom()),
    )) {
      const lat =
          group.reduce((sum, s) => sum + Number(s.latitude), 0) / group.length,
        lng =
          group.reduce((sum, s) => sum + Number(s.longitude), 0) / group.length;
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "map-pin",
          html: `<span>${group.length > 1 ? group.length : "●"}</span>`,
          iconSize: [38, 38],
        }),
      })
        .addTo(markers)
        .on("click", () =>
          group.length > 1
            ? map.setView([lat, lng], Math.min(19, map.getZoom() + 2))
            : choose(group[0]),
        );
    }
    if (selected && validPoint(selected.latitude, selected.longitude))
      L.marker([selected.latitude, selected.longitude])
        .addTo(markers)
        .bindPopup(esc(selected.name))
        .openPopup();
  }
  function choose(store) {
    if (!store) return;
    selected = store;
    redraw();
    onSelect(store);
  }
  async function load() {
    const id = ++version,
      bounds = map.getBounds();
    if (
      bounds.getNorth() - bounds.getSouth() > 6 ||
      bounds.getEast() - bounds.getWest() > 8
    )
      return;
    try {
      const data = await api.request(
        `/shops?${query({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest(), limit: 300 })}`,
      );
      if (destroyed || id !== version) return;
      shops = rows(data);
      redraw();
      onStores(shops);
    } catch (error) {
      if (!destroyed && id === version) onError(error);
    }
  }
  map.on("moveend", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 500);
  });
  load();
  return {
    choose,
    async locate() {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 15000,
              maximumAge: 30000,
            })
          : reject(new Error("Геолокация недоступна")),
      );
      if (destroyed) throw new Error("Карта закрыта");
      gps = { lat: position.coords.latitude, lng: position.coords.longitude };
      gpsMarker?.remove();
      gpsMarker = L.circleMarker([gps.lat, gps.lng], {
        radius: 8,
        color: "#fff",
        fillColor: "#0b8fd1",
        fillOpacity: 1,
      }).addTo(map);
      map.setView([gps.lat, gps.lng], 15);
      return gps;
    },
    async route(mode = "foot") {
      if (!selected) throw new Error("Выберите магазин");
      if (!validPoint(selected.latitude, selected.longitude))
        throw new Error("У магазина не указаны координаты");
      if (!gps) await this.locate();
      const data = await api.request(
        `/route?${query({ start_lat: gps.lat, start_lng: gps.lng, end_lat: selected.latitude, end_lng: selected.longitude, mode })}`,
      );
      const result = data.routes?.[0];
      if (destroyed) throw new Error("Карта закрыта");
      if (!result?.geometry) throw new Error("Маршрут не найден");
      route?.remove();
      route = L.geoJSON(result.geometry, {
        style: {
          color: "#0b8fd1",
          weight: 5,
          dashArray: mode === "foot" ? "2 8" : null,
        },
      }).addTo(map);
      map.fitBounds(route.getBounds(), { padding: [30, 30] });
      return `${(result.distance / 1000).toFixed(1)} км · ~${Math.ceil(result.duration / 60)} мин`;
    },
    destroy() {
      destroyed = true;
      version++;
      clearTimeout(timer);
      map.remove();
    },
  };
}
