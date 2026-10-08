import { query, rows } from "./api.js";
import { esc } from "./ui.js";
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
let loadingYandex;
export function loadYandexMaps(){
 if(globalThis.ymaps)return new Promise(resolve=>globalThis.ymaps.ready(()=>resolve(globalThis.ymaps)));
 if(loadingYandex)return loadingYandex;
 const key=String(globalThis.MAPMARKET_CONFIG?.YANDEX_MAPS_API_KEY||'').trim();
 if(!key)return Promise.reject(new Error('Для карты сайта требуется настроить Yandex JavaScript API. Координаты можно указать вручную.'));
 loadingYandex=new Promise((resolve,reject)=>{const script=document.createElement('script');let settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove();reject(error);}else resolve(globalThis.ymaps);};const timer=setTimeout(()=>finish(new Error('Яндекс.Карта не загрузилась. Повторите попытку.')),15000);script.src='https://api-maps.yandex.ru/2.1/?'+new URLSearchParams({apikey:key,lang:'ru_RU'});script.onerror=()=>finish(new Error('Яндекс.Карта не загрузилась. Проверьте соединение.'));script.onload=()=>{if(!globalThis.ymaps)return finish(new Error('Яндекс.Карта недоступна.'));globalThis.ymaps.ready(()=>finish());};document.head.append(script);}).catch(error=>{loadingYandex=null;throw error;});return loadingYandex;
}
export async function mountStoreMap(element,stores,{onSelect}={}){
 const y=await loadYandexMaps();if(!element.isConnected)return null;
 element.replaceChildren();const map=new y.Map(element,{center:[41.3111,69.2797],zoom:12,controls:['zoomControl','geolocationControl','fullscreenControl']});
 const cluster=new y.Clusterer({preset:'islands#blueClusterIcons',groupByCoordinates:false});
 for(const store of stores.filter(s=>validPoint(s.latitude,s.longitude))){const marker=new y.Placemark([Number(store.latitude),Number(store.longitude)],{balloonContent:'<b>'+esc(store.name)+'</b><br>'+esc(store.address||''),hintContent:esc(store.name)},{preset:'islands#blueShoppingIcon'});marker.events.add('click',()=>onSelect?.(store));cluster.add(marker);}
 map.geoObjects.add(cluster);return {remove:()=>map.destroy()};
}
export function locationPicker(element,onPick,current){
 let destroyed=false,map;
 element.textContent='Загружаем Яндекс.Карту…';loadYandexMaps().then(y=>{if(destroyed||!element.isConnected)return;element.replaceChildren();const point=validPoint(current?.lat??current?.[0],current?.lng??current?.[1])?[Number(current.lat??current[0]),Number(current.lng??current[1])]:[41.3111,69.2797];map=new y.Map(element,{center:point,zoom:14,controls:['zoomControl','geolocationControl']});const marker=new y.Placemark(point,{}, {preset:'islands#blueShoppingIcon',draggable:true});map.geoObjects.add(marker);const picked=coords=>{marker.geometry.setCoordinates(coords);onPick({lat:coords[0],lng:coords[1]});};map.events.add('click',event=>picked(event.get('coords')));marker.events.add('dragend',()=>picked(marker.geometry.getCoordinates()));}).catch(error=>{if(!destroyed)element.textContent=error.message;});return()=>{destroyed=true;map?.destroy();};
}
export function mountBuyerMap(element,{api,onStores,onSelect,onError}){
 let map,selected,gps,route,destroyed=false,version=0,timer;
 const ready=loadYandexMaps().then(y=>{if(destroyed)return;map=new y.Map(element,{center:[41.3111,69.2797],zoom:13,controls:['zoomControl']});map.events.add('boundschange',()=>{clearTimeout(timer);timer=setTimeout(load,500);});return load();});ready.catch(onError);
 async function load(){if(destroyed||!map)return;const id=++version,[[south,west],[north,east]]=map.getBounds();if(north-south>6||east-west>8)return;try{const shops=rows(await api.request('/shops?'+query({north,south,east,west,limit:300})));if(destroyed||id!==version)return;map.geoObjects.removeAll();const cluster=new globalThis.ymaps.Clusterer({preset:'islands#blueClusterIcons'});for(const shop of shops.filter(s=>validPoint(s.latitude,s.longitude))){const marker=new globalThis.ymaps.Placemark([Number(shop.latitude),Number(shop.longitude)],{hintContent:esc(shop.name)},{preset:'islands#blueShoppingIcon'});marker.events.add('click',()=>controller.choose(shop));cluster.add(marker);}map.geoObjects.add(cluster);if(route)map.geoObjects.add(route);onStores(shops);}catch(error){if(!destroyed&&id===version)onError(error);}}
 const controller={choose(store){if(store){selected=store;onSelect(store);}},async locate(){await ready;const position=await new Promise((resolve,reject)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:15000,maximumAge:30000}):reject(new Error('Геолокация недоступна')));if(destroyed)throw new Error('Карта закрыта');gps={lat:position.coords.latitude,lng:position.coords.longitude};map.setCenter([gps.lat,gps.lng],15);return gps;},async route(mode='foot'){await ready;if(!selected||!validPoint(selected.latitude,selected.longitude))throw new Error('Выберите магазин с координатами');if(!gps)await this.locate();const data=await api.request('/route?'+query({start_lat:gps.lat,start_lng:gps.lng,end_lat:selected.latitude,end_lng:selected.longitude,mode})),result=data.routes?.[0];if(destroyed)throw new Error('Карта закрыта');if(!result?.geometry?.coordinates)throw new Error('Маршрут не найден');if(route)map.geoObjects.remove(route);route=new globalThis.ymaps.Polyline(result.geometry.coordinates.map(p=>[p[1],p[0]]),{},{strokeColor:'#0b8fd1',strokeWidth:5});map.geoObjects.add(route);map.setBounds(route.geometry.getBounds());return (result.distance/1000).toFixed(1)+' км · ~'+Math.ceil(result.duration/60)+' мин';},destroy(){destroyed=true;version++;clearTimeout(timer);map?.destroy();}};return controller;
}
