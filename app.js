import {appearanceSettings} from './shared/appearance.js';
import {createBuyerAuth} from './buyer-auth.js?v=20261003-1';
function resolveApiBaseUrl(configuredUrl, location) {
  const configured=String(configuredUrl||'').trim().replace(/\/+$/,'');
  if(configured)return configured;
  return ['localhost','127.0.0.1','::1'].includes(location?.hostname)
    ? String(location.origin||'').replace(/\/+$/,'')
    : '';
}
const API_BASE = resolveApiBaseUrl(window.MAPMARKET_CONFIG?.PUBLIC_API_BASE_URL,window.location);
const API_REQUEST_TIMEOUT_MS = 15_000;

const dictionary = {
  ru: { home:'Главная', favorites:'Избранное', catalog:'Каталог', chats:'Чаты', profile:'Профиль', map:'Карта', language:'Язык', searchPlaceholder:'Поиск товаров и категорий', hello:'Добро пожаловать', hero:'Находите лучшие товары рядом', heroText:'Сравнивайте цены, открывайте магазины на карте и прокладывайте маршрут.', explore:'Смотреть каталог', openMap:'Открыть карту', recommendations:'Рекомендации', nearby:'Магазины рядом', all:'Все', login:'Войти', logout:'Выйти', notifications:'Уведомления', wallet:'Кошелёк и покупки', settings:'Настройки', help:'Справка и поддержка', account:'Мой аккаунт', empty:'Здесь пока ничего нет', price:'Цена', route:'Проложить маршрут', write:'Написать продавцу', reviews:'Отзывы', send:'Отправить', addPhoto:'Добавить фото', message:'Введите сообщение', save:'Сохранить', deleteAccount:'Удалить аккаунт', searchResults:'Результаты поиска', categories:'Категории', recently:'Недавно просмотренные', loadMore:'Показать ещё', retry:'Повторить' },
  en: { home:'Home', favorites:'Favorites', catalog:'Catalog', chats:'Chats', profile:'Profile', map:'Map', language:'Language', searchPlaceholder:'Search products and categories', hello:'Welcome', hero:'Find the best products nearby', heroText:'Compare prices, discover stores on the map and build a route.', explore:'Browse catalog', openMap:'Open map', recommendations:'Recommendations', nearby:'Nearby stores', all:'All', login:'Sign in', logout:'Sign out', notifications:'Notifications', wallet:'Wallet and purchases', settings:'Settings', help:'Help and support', account:'My account', empty:'Nothing here yet', price:'Price', route:'Build route', write:'Message seller', reviews:'Reviews', send:'Send', addPhoto:'Add photo', message:'Enter a message', save:'Save', deleteAccount:'Delete account', searchResults:'Search results', categories:'Categories', recently:'Recently viewed', loadMore:'Load more', retry:'Retry' },
  uz: { home:'Bosh sahifa', favorites:'Sevimlilar', catalog:'Katalog', chats:'Chatlar', profile:'Profil', map:'Xarita', language:'Til', searchPlaceholder:'Mahsulot va toifalarni qidirish', hello:'Xush kelibsiz', hero:'Yaqindagi eng yaxshi mahsulotlarni toping', heroText:'Narxlarni solishtiring, xaritada do‘konlarni toping va yo‘nalish tuzing.', explore:'Katalogni ko‘rish', openMap:'Xaritani ochish', recommendations:'Tavsiyalar', nearby:'Yaqindagi do‘konlar', all:'Barchasi', login:'Kirish', logout:'Chiqish', notifications:'Bildirishnomalar', wallet:'Hamyon va xaridlar', settings:'Sozlamalar', help:'Yordam', account:'Mening hisobim', empty:'Hozircha bu yer bo‘sh', price:'Narx', route:'Yo‘nalish', write:'Sotuvchiga yozish', reviews:'Sharhlar', send:'Yuborish', addPhoto:'Rasm qo‘shish', message:'Xabar kiriting', save:'Saqlash', deleteAccount:'Hisobni o‘chirish', searchResults:'Qidiruv natijalari', categories:'Toifalar', recently:'Yaqinda ko‘rilgan', loadMore:'Yana ko‘rsatish', retry:'Qayta urinish' },
};

const state = {
  route: 'home', token: localStorage.getItem('mm_web_token') || '',
  user: JSON.parse(localStorage.getItem('mm_web_user') || 'null'),
  language: localStorage.getItem('mm_web_language') || 'ru',
  products: [], shops: [], categories: [], favorites: new Set(), recent: JSON.parse(localStorage.getItem('mm_web_recent') || '[]'),
  productCache: new Map(), productDetailRequests: new Map(),
  catalogLoaded: false, shopsLoaded: false, categoriesLoaded: false,
  catalogQuery: {}, catalogOffset: 0, catalogHasMore: false, catalogLoading: false, catalogRequestId: 0,
  chats: [], activeChat: null, pendingFile: null, map: null, markers: [], loading: false,
  activeProduct: null, productImageIndex: 0,
  searchSuggestionId: 0,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const t = (key) => dictionary[state.language]?.[key] || dictionary.ru[key] || key;
const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = (value) => `${new Intl.NumberFormat(state.language === 'en' ? 'en-US' : 'ru-RU').format(Number(value || 0))} сум`;
const imageUrl = (raw) => { const value=String(raw||'').trim(); return value ? (value.startsWith('http') ? value : `${API_BASE}${value.startsWith('/')?'':'/'}${value}`) : 'assets/product-placeholder.svg'; };
const authHeaders = () => state.token ? {Authorization:`Bearer ${state.token}`} : {};

async function api(path, options={}) {
  if(!API_BASE)throw new Error('Адрес сервера не настроен. Обновите страницу или обратитесь в поддержку.');
  const {auth=true, ...requestOptions}=options;
  const headers = {...(auth?authHeaders():{}), ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers||{})};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),API_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {...requestOptions, headers, signal:controller.signal});
  } catch (error) {
    if(controller.signal.aborted)throw new Error('Сервер отвечает слишком долго. Проверьте интернет и повторите попытку.');
    throw new Error('Не удалось подключиться к серверу YAQINTOP MARKET. Проверьте интернет и откройте сайт по официальной ссылке.');
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

function icon(name, size=20) { return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`; }
function refreshIcons() { window.lucide?.createIcons({attrs:{'stroke-width':2.1}}); }
function toast(message, error=false) { const el=document.createElement('div'); el.className=`toast${error?' error':''}`; el.textContent=message; $('#toastRoot').append(el); setTimeout(()=>el.remove(),3200); }
function setLoading() { $('#view').innerHTML='<div class="loader"><div class="spinner"></div></div>'; }
function requireAuth(action) { if(state.token) return true; showAuth(action); return false; }

const navItems = [
  ['home','compass','home'], ['favorites','heart','favorites'], ['catalog','layout-grid','catalog'], ['chats','message-square','chats'], ['profile','user-round','profile'],
];

function renderNavigation() {
  const html = navItems.map(([route,ico,label])=>`<button class="nav-button ${state.route===route?'active':''}" data-route="${route}">${icon(ico)}<span>${t(label)}</span></button>`).join('');
  $('#desktopNav').innerHTML = `${html}<button class="nav-button ${state.route==='map'?'active':''}" data-route="map">${icon('map')}<span>${t('map')}</span></button>`;
  $('#mobileNav').innerHTML = html;
  $$('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  $$('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
  $('#sideName').textContent = state.user?.name || 'Гость';
  $('#sideAvatar').textContent = (state.user?.name || 'M').trim()[0]?.toUpperCase() || 'M';
  refreshIcons();
}

async function navigate(route, data=null) {
  state.searchSuggestionId++; $('#searchSuggestions').classList.add('hidden');
  state.route=route; state.routeData=data; renderNavigation(); window.scrollTo({top:0,behavior:'smooth'}); setLoading();
  try {
    if(route==='home') await renderHome();
    else if(route==='catalog') await renderCatalog(data);
    else if(route==='favorites') await renderFavorites();
    else if(route==='map') await renderMap();
    else if(route==='chats') await renderChats();
    else if(route==='profile') await renderProfile();
    else if(route==='notifications') await renderNotifications();
    else if(route==='search') await renderSearch(data || '');
    else if(route==='product') await renderProductDetails(Number(data));
  } catch(error) { $('#view').innerHTML=errorState(error); }
  refreshIcons();
}

async function bootstrap() {
  renderNavigation(); bindGlobalEvents();
  if(state.token) {
    try { const me=await api('/users/me'); state.user=me.user; persistSession(); await loadFavorites(); }
    catch { logout(false); }
  }
  const initialLoads=await Promise.allSettled([loadProducts(), loadShops(), loadCategories()]);
  const initialFailure=initialLoads.find(result=>result.status==='rejected');
  if(initialFailure){state.route='home';state.routeData=null;renderNavigation();$('#view').innerHTML=errorState(initialFailure.reason);}
  else navigate('home');
  if(state.token) { checkNotifications(); checkPendingPurchase(); }
}

const CATALOG_PAGE_SIZE = 24;
const PRODUCT_DETAIL_CACHE_TTL_MS = 60_000;
const PRODUCT_CACHE_MAX_ENTRIES = 250;
function productCacheKey(id, language=state.language) { return `${language}:${Number(id)}`; }
function cacheProduct(product, {language=state.language, detailed=false}={}) {
  const id=Number(product?.id);
  if(!Number.isInteger(id)||id<=0)return null;
  const key=productCacheKey(id,language), previous=state.productCache.get(key);
  const entry={product:{...(previous?.product||{}),...product},detailed:detailed||Boolean(previous?.detailed),fetchedAt:detailed?Date.now():(previous?.fetchedAt||0)};
  state.productCache.delete(key);
  state.productCache.set(key,entry);
  while(state.productCache.size>PRODUCT_CACHE_MAX_ENTRIES)state.productCache.delete(state.productCache.keys().next().value);
  return entry;
}
function getCachedProduct(id, language=state.language) {
  return state.productCache.get(productCacheKey(id,language)) || null;
}
async function fetchProductDetails(id, language=state.language) {
  const key=productCacheKey(id,language), existing=state.productDetailRequests.get(key);
  if(existing)return existing;
  const request=api(`/products/${Number(id)}?lang=${encodeURIComponent(language)}`)
    .then(product=>cacheProduct(product,{language,detailed:true}).product)
    .finally(()=>state.productDetailRequests.delete(key));
  state.productDetailRequests.set(key,request);
  return request;
}
async function loadProducts(params={}, {append=false}={}) {
  if (append && state.catalogLoading) return state.products;
  if (append && !state.catalogHasMore) return state.products;
  if (!append) {
    state.catalogQuery = {...params};
    state.catalogOffset = 0;
    state.catalogHasMore = true;
    state.products = [];
  }
  const requestId=++state.catalogRequestId;
  state.catalogLoading = true;
  try {
    const qs = new URLSearchParams({lang:state.language,limit:String(CATALOG_PAGE_SIZE),offset:String(state.catalogOffset),...state.catalogQuery});
    const page = await api(`/products?${qs}`);
    if (requestId!==state.catalogRequestId) return state.products;
    const products = Array.isArray(page) ? page : [];
    for(const product of products)cacheProduct(product);
    if (append) {
      const known = new Set(state.products.map(product => Number(product.id)));
      for (const product of products) {
        const id=Number(product.id);
        if (known.has(id)) continue;
        known.add(id);
        state.products.push(product);
      }
    } else {
      state.products = products;
    }
    state.catalogOffset += products.length;
    state.catalogHasMore = products.length === CATALOG_PAGE_SIZE;
    state.catalogLoaded = true;
    return state.products;
  } finally {
    if (requestId===state.catalogRequestId) state.catalogLoading = false;
  }
}
async function loadShops() { state.shops=await api('/shops');state.shopsLoaded=true;return state.shops; }
async function loadCategories() { state.categories=await api('/products/categories');state.categoriesLoaded=true;return state.categories; }
async function loadFavorites() { if(!state.token)return; const rows=await api(`/users/me/favorites?lang=${state.language}`); state.favorites=new Set(rows.map(x=>Number(x.id||x.product_id))); }
function persistSession(){ localStorage.setItem('mm_web_token',state.token); localStorage.setItem('mm_web_user',JSON.stringify(state.user)); localStorage.setItem('mm_web_language',state.language); }
function logout(render=true){ state.token='';state.user=null;state.favorites.clear();localStorage.removeItem('mm_web_token');localStorage.removeItem('mm_web_user');if(render)navigate('home');renderNavigation(); }

function emptyState(ico='package-open', text=t('empty')) { return `<div class="empty"><div>${icon(ico,52)}<h3>${esc(text)}</h3></div></div>`; }
function errorState(error) { return `<div class="empty"><div>${icon('triangle-alert',52)}<h3>${esc(error?.message||'Не удалось загрузить данные.')}</h3><button class="button" data-retry-route>${t('retry')}</button></div></div>`; }
function pageHead(title, subtitle=''){return `<div class="page-head"><div>${subtitle?`<p class="eyebrow">${esc(subtitle)}</p>`:''}<h1>${esc(title)}</h1></div></div>`;}

function productCard(p) {
  const id=Number(p.id); const saved=state.favorites.has(id); const discount=Number(p.discount_percent||0);
  return `<article class="product-card" data-product="${id}">
    <img class="product-image" src="${esc(imageUrl(p.image_url || p.image_urls?.[0]))}" alt="${esc(p.title)}" loading="lazy" />
    ${discount>0?`<span class="discount">-${Math.round(discount)}%</span>`:''}
    <button class="favorite-button ${saved?'active':''}" data-favorite="${id}" aria-label="${t('favorites')}">${icon(saved?'heart':'heart',20)}</button>
    <div class="product-body"><h3>${esc(p.title||'Товар')}</h3><div class="product-meta">${esc(p.category||p.shop_name||'')}</div>
    <div class="rating">${icon('star',16)} <b>${Number(p.product_average_rating||p.average_rating||p.rating||0).toFixed(1)}</b><span>(${Number(p.product_reviews_count||p.reviews_count||0)})</span></div>
    <div class="price-row">${p.old_price&&Number(p.old_price)>Number(p.price)?`<span class="old-price">${money(p.old_price)}</span>`:''}<span class="price">${money(p.price)}</span></div></div></article>`;
}
function productGrid(items){return items.length?`<div class="product-grid">${items.map(productCard).join('')}</div>`:emptyState();}
function storeCard(s){return `<button class="store-card" data-store="${Number(s.id)}"><img src="${esc(imageUrl(s.logo_url))}" alt=""><span><b>${esc(s.name||'Магазин')}</b><small class="muted">${esc(s.specialization||s.address||'')}</small></span></button>`;}

async function renderHome(){
  if(!state.catalogLoaded) await loadProducts(); if(!state.shopsLoaded)await loadShops();
  let recommended=[]; if(state.token){try{recommended=await api(`/products/recommendations?lang=${state.language}`);}catch{}}
  const items=recommended.length?recommended:state.products.slice(0,8);
  $('#view').innerHTML=`<section class="hero"><div><p class="eyebrow" style="color:#bcd3ff">YAQINTOP MARKET</p><h1>${t('hero')}</h1><p>${t('heroText')}</p><div class="hero-actions"><button class="button white" data-route="catalog">${icon('layout-grid')} ${t('explore')}</button><button class="button" data-route="map">${icon('map')} ${t('openMap')}</button></div></div><div class="hero-art"><img src="assets/yaqintop-logo.png" alt=""></div></section>
  <section class="section"><div class="section-head"><h2>${t('categories')}</h2></div><div class="chips"><button class="chip active" data-category="">${t('all')}</button>${state.categories.map(c=>`<button class="chip" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div></section>
  <section class="section"><div class="section-head"><h2>${t('recommendations')}</h2><button class="button soft" data-route="catalog">${t('all')} ${icon('arrow-right')}</button></div>${productGrid(items)}</section>
  <section class="section"><div class="section-head"><h2>${t('nearby')}</h2><button class="button soft" data-route="map">${t('map')}</button></div><div class="store-grid">${state.shops.slice(0,6).map(storeCard).join('')}</div></section>`;
}

async function renderCatalog(category='') {
  const params=category?{category}:{}; const items=await loadProducts(params);
  $('#view').innerHTML=catalogPageMarkup(category,items);
}

async function renderSearch(query){
  const items=await loadProducts({q:query,catalog_search:'true'});
  $('#view').innerHTML=searchPageMarkup(query,items);
  const recent=[query,...JSON.parse(localStorage.getItem('mm_web_queries')||'[]').filter(x=>x!==query)].slice(0,8);localStorage.setItem('mm_web_queries',JSON.stringify(recent));
}

function catalogPageMarkup(category,items) {
  return `${pageHead(t('catalog'),'YAQINTOP MARKET')}<div class="chips"><button class="chip ${!category?'active':''}" data-category="">${t('all')}</button>${state.categories.map(c=>`<button class="chip ${category===c?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div>${productGrid(items)}${loadMoreMarkup()}`;
}

function searchPageMarkup(query,items) {
  return `${pageHead(t('searchResults'),query)}${productGrid(items)}${loadMoreMarkup()}`;
}

function loadMoreMarkup() {
  return state.catalogHasMore
    ? `<div class="load-more-wrap"><button class="button soft" data-load-more-products>${t('loadMore')}</button></div>`
    : '';
}

async function loadMoreProducts() {
  if (state.catalogLoading || !state.catalogHasMore || !['catalog','search'].includes(state.route)) return;
  const route=state.route, routeData=state.routeData;
  await loadProducts(state.catalogQuery,{append:true});
  if (state.route!==route || state.routeData!==routeData) return;
  $('#view').innerHTML=route==='catalog'
    ? catalogPageMarkup(routeData||'',state.products)
    : searchPageMarkup(routeData||'',state.products);
  refreshIcons();
}

async function renderFavorites(){
  if(!requireAuth(()=>navigate('favorites')))return navigate('home'); await loadFavorites();
  const items=await api(`/users/me/favorites?lang=${state.language}`);
  for(const product of items)cacheProduct(product);
  $('#view').innerHTML=`${pageHead(t('favorites'),'YAQINTOP MARKET')}${productGrid(items)}`;
}

async function toggleFavorite(id,button){
  if(!requireAuth())return; const save=!state.favorites.has(id);
  await api(`/users/me/favorites/${id}`,{method:save?'POST':'DELETE',body:save?JSON.stringify({selected_color:'',selected_size:''}):undefined});
  save?state.favorites.add(id):state.favorites.delete(id); button?.classList.toggle('active',save);button.innerHTML=icon('heart',20);refreshIcons();
}

async function renderProductDetails(id){
  const language=state.language;
  const cached=getCachedProduct(id,language)?.product || state.products.find(product=>Number(product.id)===Number(id));
  if(cached){cacheProduct(cached,{language});state.activeProduct=cached;state.productImageIndex=0;renderProductDetailsBody();refreshIcons();}
  const entry=getCachedProduct(id,language);
  if(!entry?.detailed || Date.now()-entry.fetchedAt>=PRODUCT_DETAIL_CACHE_TTL_MS){
    const refresh=fetchProductDetails(id,language);
    if(!cached){
      const product=await refresh;
      if(state.route!=='product'||Number(state.routeData)!==Number(id)||state.language!==language)return;
      state.activeProduct=product;
    }else{
      refresh.then(product=>{
        if(state.route==='product'&&Number(state.routeData)===Number(id)&&state.language===language){state.activeProduct=product;renderProductDetailsBody();refreshIcons();}
      }).catch(error=>console.warn('Product detail refresh failed; showing cached data.',error));
    }
  }
  if(state.route!=='product'||Number(state.routeData)!==Number(id)||state.language!==language)return;
  const p=state.activeProduct||cached;
  if(!p)return;
  state.recent=[p,...state.recent.filter(x=>Number(x.id)!==Number(id))].slice(0,20);
  localStorage.setItem('mm_web_recent',JSON.stringify(state.recent));
  if(!cached)renderProductDetailsBody();
}
function renderProductDetailsBody(){
  const p=state.activeProduct; if(!p)return;
  const images=[...new Set([...(Array.isArray(p.image_urls)?p.image_urls:[]),p.image_url].filter(Boolean))];
  const active=images[state.productImageIndex]||p.image_url;
  const specs=[['Бренд',p.brand],['Модель',p.model],['Цвет',p.color],['Размер',p.size],['Наличие',p.in_stock===false?'Нет в наличии':'В наличии']].filter(([,v])=>v);
  $('#view').innerHTML=`<button class="back-link" data-back-catalog>${icon('arrow-left')} Назад к товарам</button>
    <section class="product-detail-page"><div class="product-gallery"><img class="detail-image" src="${esc(imageUrl(active))}" alt="${esc(p.title)}">${images.length>1?`<div class="gallery-thumbs">${images.map((src,index)=>`<button class="gallery-thumb ${index===state.productImageIndex?'active':''}" data-product-image="${index}"><img src="${esc(imageUrl(src))}" alt=""></button>`).join('')}</div>`:''}</div>
    <div class="detail-info"><p class="eyebrow">${esc(p.category||'YAQINTOP MARKET')}</p><h1>${esc(p.title||'Товар')}</h1><p class="muted">${esc(p.shop_name||'Магазин')}</p><div class="rating">${icon('star')} <b>${Number(p.product_average_rating||p.average_rating||0).toFixed(1)}</b><span>(${Number(p.product_reviews_count||p.reviews_count||0)} отзывов)</span></div><div class="price-row detail-price"><span class="price">${money(p.price)}</span>${p.old_price&&Number(p.old_price)>Number(p.price)?`<span class="old-price">${money(p.old_price)}</span>`:''}</div><div class="hero-actions"><button class="button" data-product-chat="${Number(p.shop_id)}">${icon('message-circle')} ${t('write')}</button><button class="button soft" data-store-route="${Number(p.shop_id)}">${icon('route')} ${t('route')}</button><button class="button ghost" data-product-reviews="${Number(p.id)}">${icon('star')} ${t('reviews')}</button></div>${buyerBranchOffers(p)}<section class="detail-section"><h2>Описание</h2><p class="detail-description">${esc(p.description||'Описание пока не добавлено.')}</p></section>${specs.length?`<section class="detail-section"><h2>Характеристики</h2><div class="spec-list">${specs.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div></section>`:''}</div></section>`;
}

function buyerBranchOffers(p){
  if(!Array.isArray(p.offers)||!p.offers.length)return '';
  return '<section class="detail-section"><h2>Где купить</h2><div class="settings-list">'+p.offers.map(o=>`<button class="list-card" data-branch-offer="${Number(o.product_id)}"><span><b>${esc(o.business_name||o.shop_name)} — ${esc(o.branch_name||o.shop_name)}</b><small>${esc(o.address)} · ${esc(o.branch_code||'')}</small><small>${money(o.price)} · ${o.in_stock?'В наличии':'Нет в наличии'}</small></span></button>`).join('')+'</div></section>';
}
async function showStore(shopId){
  const shop=state.shops.find(s=>Number(s.id)===shopId)||{}; const products=await api(`/products?shop_id=${shopId}&lang=${state.language}`);const network=await api(`/shops/${shopId}/locations`);
  openModal(`<div class="profile-hero"><img class="store-logo" src="${esc(imageUrl(shop.logo_url))}" alt=""><div><p class="eyebrow">YAQINTOP MARKET</p><h2>${esc(shop.name||'Магазин')}</h2><p class="muted">${esc(shop.address||'')}</p></div></div>${network.branches.length>1?`<section><h3>Филиалы сети</h3>${network.branches.map(b=>`<button class="list-card" data-store="${b.branch_id}"><span><b>${esc(b.branch_name||b.name)} · ${esc(b.branch_code)}</b><small>${esc(b.address)}</small></span></button>`).join('')}</section>`:''}<div class="hero-actions"><button class="button" data-product-chat="${shopId}">${icon('message-circle')} ${t('write')}</button><button class="button soft" data-store-route="${shopId}">${icon('route')} ${t('route')}</button></div><section class="section">${productGrid(products)}</section>`,shop.name||'',true);
}

async function renderMap(){
  if(!state.shops.length)await loadShops(); $('#view').innerHTML=`${pageHead(t('map'),'YAQINTOP MARKET')}<div class="map-layout"><div class="map-panel"><div class="store-grid" style="grid-template-columns:1fr">${state.shops.map(storeCard).join('')}</div></div><div id="map" class="map-loading"><div>${icon('map-pin',48)}<b>Загружаем карту…</b></div></div></div>`;
  if(!window.L){$('#map').innerHTML=`<div class="map-fallback">${icon('map-pin',48)}<h2>Карта временно недоступна</h2><p>Выберите магазин слева — мы откроем маршрут в Google Maps.</p></div>`;refreshIcons();return;}
  setTimeout(()=>{
    try {
      state.map?.remove();
      state.map=window.L.map('map').setView([41.3111,69.2406],12);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(state.map);
      state.shops.forEach(s=>{
        const lat=Number(s.latitude),lng=Number(s.longitude);
        if(Number.isFinite(lat)&&Number.isFinite(lng)) {
          window.L.marker([lat,lng]).addTo(state.map).bindPopup(`<b>${esc(s.name)}</b><br>${esc(s.address||'')}`);
        }
      });
    } catch (_) {
      $('#map').innerHTML=`<div class="map-fallback">${icon('map-pin',48)}<h2>Не удалось открыть карту</h2><p>Выберите магазин слева, чтобы построить маршрут.</p></div>`;
      refreshIcons();
    }
  },40);
}

function openRoute(shopId){ const s=state.shops.find(x=>Number(x.id)===shopId); if(!s)return; const dest=`${s.latitude},${s.longitude}`; if(navigator.geolocation)navigator.geolocation.getCurrentPosition(pos=>window.open(`https://www.google.com/maps/dir/?api=1&origin=${pos.coords.latitude},${pos.coords.longitude}&destination=${dest}`,'_blank'),()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`,'_blank')); }

async function renderChats(){
  if(!requireAuth(()=>navigate('chats')))return; state.chats=await api('/chats');
  const threads=state.chats.length?state.chats.map(c=>`<button class="chat-thread" data-chat="${Number(c.chat_id||c.id)}"><span class="avatar">${esc((c.shop_name||'M')[0])}</span><span class="chat-thread-content"><b>${esc(c.shop_name||'Магазин')}</b><p>${esc(c.last_message||'Начните диалог')}</p></span><small>${esc(c.last_time||'')}</small></button>`).join(''):`<div class="chat-empty"><p>У вас ещё нет диалогов.</p><small>Откройте товар или выберите магазин, чтобы написать продавцу.</small><div class="chat-store-starts">${state.shops.slice(0,4).map(s=>`<button data-product-chat="${Number(s.id)}">${esc(s.name)}</button>`).join('')}</div></div>`;
  $('#view').innerHTML=`${pageHead(t('chats'),'YAQINTOP MARKET')}<div class="chat-layout"><aside class="chat-list"><div class="chat-list-head"><b>${t('chats')}</b><span>${state.chats.length||''}</span></div>${threads}</aside><section id="chatRoom" class="chat-room hidden-mobile"><div class="empty">${icon('message-circle',52)}<h3>Выберите диалог</h3><p>Или начните новый чат из карточки товара.</p></div></section></div>`;
}

async function openChat(chatId,shopName='Магазин'){
  const messages=await api(`/chats/${chatId}/messages`);state.activeChat=chatId;
  $$('.chat-thread').forEach(x=>x.classList.toggle('active',Number(x.dataset.chat)===chatId));
  $('#chatRoom').className='chat-room';$('#chatRoom').innerHTML=`<div class="chat-room-head"><button class="icon-button mobile-chat-back">${icon('arrow-left')}</button>${esc(shopName)}</div><div id="messages" class="messages">${messages.map(messageHtml).join('')}</div><div class="composer-wrap"><div id="attachmentPreview"></div><div class="composer-row"><div class="composer"><button class="icon-button" data-chat-photo title="${t('addPhoto')}">${icon('plus',28)}</button><textarea id="chatInput" rows="1" placeholder="${t('message')}"></textarea></div><button id="chatSend" class="send-button hidden-send">${icon('send',22)}</button></div></div>`;refreshIcons();setTimeout(()=>{$('#messages').scrollTop=$('#messages').scrollHeight;},10);
}
function messageHtml(m){const mine=m.sender==='buyer';return `<div class="message ${mine?'mine':''}">${m.media_url?`<img src="${esc(imageUrl(m.media_url))}" alt="">`:''}${m.text&&m.text!=='📷 Фото'?`<div>${esc(m.text)}</div>`:''}<time>${esc(m.time||'')}</time></div>`;}
async function sendChatMessage(){const input=$('#chatInput');const text=input.value.trim();if(!text&&!state.pendingFile)return;let media='';if(state.pendingFile){const form=new FormData();form.append('image',state.pendingFile);const uploaded=await api('/upload',{method:'POST',body:form});media=uploaded.url;}const saved=await api(`/chats/${state.activeChat}/messages`,{method:'POST',body:JSON.stringify({text:text||'📷 Фото',media_url:media})});$('#messages').insertAdjacentHTML('beforeend',messageHtml({...saved,sender:'buyer'}));input.value='';state.pendingFile=null;$('#attachmentPreview').innerHTML='';updateSendButton();$('#messages').scrollTop=$('#messages').scrollHeight;}

async function startChat(shopId){if(!requireAuth(()=>navigate('product',state.activeProduct?.id)))return;const chat=await api('/chats',{method:'POST',body:JSON.stringify({shop_id:shopId})});closeModal();await navigate('chats');await openChat(Number(chat.chat_id),chat.shop_name);}

async function renderNotifications(){
  if(!requireAuth(()=>navigate('notifications')))return navigate('home');const data=await api('/users/me/notifications');$('#notificationDot').classList.add('hidden');await api('/users/me/notifications/read-all',{method:'PUT',body:'{}'});
  $('#view').innerHTML=`${pageHead(t('notifications'),'YAQINTOP MARKET')}<div class="settings-list">${data.notifications?.length?data.notifications.map(n=>`<button class="list-card" data-store="${Number(n.shop_id)}"><span class="list-icon">${icon('bell')}</span><span><b>${esc(n.shop_name)}</b><small>${esc(n.text)}</small></span>${icon('chevron-right')}</button>`).join(''):emptyState('bell-off')}</div>`;
}
async function checkNotifications(){try{const d=await api('/users/me/notifications?limit=1');$('#notificationDot').classList.toggle('hidden',!Number(d.unread_count));}catch{}}

async function renderProfile(){
  if(!state.token){$('#view').innerHTML=`${pageHead(t('profile'),'YAQINTOP MARKET')}<div class="empty"><div><img class="auth-logo" src="assets/yaqintop-logo.png" alt=""><h2>${t('hello')}</h2><button class="button" data-auth>${t('login')}</button></div></div>${appearanceSettings()}`;return;}
  let subs={loyalty_cards:[],warranties:[],offers:[],discounts:[]};try{subs=await api('/users/me/subscriptions');}catch{}
  const total=(subs.loyalty_cards?.length||0)+(subs.warranties?.length||0)+(subs.discounts?.length||0);
  $('#view').innerHTML=`${pageHead(t('profile'),'YAQINTOP MARKET')}<div class="profile-hero"><div class="avatar">${state.user.avatar_url?`<img src="${esc(imageUrl(state.user.avatar_url))}" alt="">`:esc((state.user.name||'M')[0])}</div><div><h2>${esc(state.user.name)}</h2><p class="muted">${esc(state.user.phone||'')} · MM-ID #${state.user.id}</p></div></div><div class="stat-grid"><div class="stat"><small>${t('favorites')}</small><b>${state.favorites.size}</b></div><div class="stat"><small>${t('wallet')}</small><b>${total}</b></div><div class="stat"><small>${t('profile')}</small><b>Активен</b></div></div>
  <div class="wallet"><div class="wallet-head"><h2>YAQINTOP MARKET Wallet</h2><span>Pay & Save</span></div><div class="wallet-grid"><div class="wallet-item"><b>Талоны</b><small>QR</small></div><div class="wallet-item"><b>Скидки</b><small>${subs.discounts?.length||0}</small></div><div class="wallet-item"><b>Гарантии</b><small>${subs.warranties?.length||0}</small></div></div><div class="hero-actions"><button class="button white" data-wallet-qr>${icon('qr-code')} Показать QR</button><button class="button" data-wallet>${t('wallet')}</button></div></div>
  ${appearanceSettings()}<section class="section"><div class="settings-list"><button class="list-card" data-account><span class="list-icon">${icon('user')}</span><span><b>${t('account')}</b><small>Имя, телефон и фото</small></span>${icon('chevron-right')}</button><button class="list-card" data-wallet><span class="list-icon">${icon('wallet-cards')}</span><span><b>${t('wallet')}</b><small>Талоны, скидки и гарантии</small></span>${icon('chevron-right')}</button><button class="list-card" data-saved-card><span class="list-icon">${icon('credit-card')}</span><span><b>Сохранённая карта</b><small>Карта для оплаты услуг</small></span>${icon('chevron-right')}</button><button class="list-card" data-interests><span class="list-icon">${icon('sparkles')}</span><span><b>Мои интересы</b><small>Три любимые категории</small></span>${icon('chevron-right')}</button><button class="list-card" data-action="language"><span class="list-icon">${icon('languages')}</span><span><b>${t('language')}</b><small>Русский, English, O‘zbekcha</small></span>${icon('chevron-right')}</button><button class="list-card" data-help><span class="list-icon">${icon('headphones')}</span><span><b>${t('help')}</b><small>Поиск, карта, каталог и безопасность</small></span>${icon('chevron-right')}</button><button class="list-card" data-logout><span class="list-icon">${icon('log-out')}</span><span><b>${t('logout')}</b></span></button></div></section>`;
}

async function showWallet(){let d=await api('/users/me/subscriptions');const section=(title,items)=>`<section class="section"><h2>${title}</h2>${items.length?`<div class="settings-list">${items.map(x=>`<div class="list-card"><span class="list-icon">${icon('ticket-check')}</span><span><b>${esc(x.title||x.product_name||x.shop_name||title)}</b><small>${esc(x.description||x.status||'')}</small></span></div>`).join('')}</div>`:emptyState()}</section>`;openModal(`${section('Талоны',d.loyalty_cards||[])}${section('Скидки',d.discounts||[])}${section('Гарантии',d.warranties||[])}${section('Предложения',d.offers||[])}`,t('wallet'),true);}
async function showQr(){const d=await api('/rewards/customer/qr');openModal(`<div style="text-align:center"><div id="qrCanvas" class="qr-box"></div><h2>${esc(d.customer?.name||state.user.name)}</h2><p class="muted">MM-ID: ${esc(d.customer?.mapmarket_id||'')}</p><div class="notice">QR обновляется автоматически и используется продавцом для подтверждения покупки.</div></div>`,'QR',false);setTimeout(()=>{const canvas=document.createElement('canvas');window.QRCode?.toCanvas(canvas,d.qr_token,{width:190},error=>{if(!error)$('#qrCanvas')?.append(canvas);});},20);}

function showAccount(){openModal(`<form id="accountForm" class="form"><div class="field"><label>Фото профиля</label><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label>Имя</label><input name="name" required value="${esc(state.user.name)}"></div><div class="field"><label>Телефон</label><input disabled value="${esc(state.user.phone||'')}"></div><button class="button">${t('save')}</button><button type="button" class="button danger" data-delete-account>${t('deleteAccount')}</button></form>`,t('account'));}
function showSavedCard(){const card=JSON.parse(localStorage.getItem('mm_web_card')||'null');openModal(`<form id="cardForm" class="form"><div class="field"><label>Номер карты</label><input name="number" inputmode="numeric" maxlength="19" placeholder="8600 0000 0000 0000" value="${esc(card?.number||'')}"></div><div class="field"><label>Срок действия</label><input name="expiry" maxlength="5" placeholder="MM/YY" value="${esc(card?.expiry||'')}"></div><button class="button">${t('save')}</button>${card?'<button type="button" class="button danger" data-remove-card>Удалить карту</button>':''}</form>`,'Сохранённая карта');}
async function showInterests(){const current=await api('/users/me/preferences').catch(()=>({categories:[]}));const selected=new Set(current.categories||[]);openModal(`<form id="interestsForm" class="form"><p class="muted">${current.completed?'Выбранные категории используются для персональных рекомендаций.':'Выберите ровно три категории для персональных рекомендаций.'}</p><div class="chips">${state.categories.map(c=>`<label class="chip ${selected.has(c)?'active':''}"><input type="checkbox" name="category" value="${esc(c)}" ${selected.has(c)?'checked':''} ${current.completed?'disabled':''} hidden>${esc(c)}</label>`).join('')}</div>${current.completed?'':`<button class="button">${t('save')}</button>`}</form>`,'Мои интересы');}
async function checkPendingPurchase(){try{const data=await api('/rewards/customer/pending');const tx=data.transaction;if(!tx)return;openModal(`<div style="text-align:center"><span class="list-icon" style="margin:0 auto 14px">${icon('shopping-bag')}</span><h2>${esc(tx.shop_name)}</h2><p>${esc(tx.item_name||'Покупка')}</p><div class="stat-grid"><div class="stat"><small>Сумма</small><b>${money(tx.purchase_amount)}</b></div><div class="stat"><small>Скидка</small><b>${Number(tx.discount_percent||0)}%</b></div><div class="stat"><small>К оплате</small><b>${money(tx.final_amount)}</b></div></div><button class="button" data-confirm-purchase="${Number(tx.id)}">Подтвердить оплату</button></div>`,'Подтверждение оплаты');}catch{}}
function showHelp(){const topics=[['search','Поиск и карта','Товары, магазины, расстояние и маршрут'],['archive','Товары, каталог и избранное','Цена, скидка, наличие и сохранённые товары'],['message-square','Связь с продавцом','Чат и фотографии'],['star','Отзывы и рейтинги','Оценка товара после покупки'],['shield','Безопасность и поддержка','Аккаунт, данные и помощь']];openModal(`<div class="settings-list">${topics.map(x=>`<div class="list-card"><span class="list-icon">${icon(x[0])}</span><span><b>${x[1]}</b><small>${x[2]}</small></span>${icon('chevron-right')}</div>`).join('')}</div>`,t('help'));}
function showLanguage(){openModal(`<div class="settings-list">${[['ru','Русский'],['en','English'],['uz','O‘zbekcha']].map(([code,label])=>`<button class="list-card" data-language="${code}"><span class="list-icon">${code===state.language?icon('check'):icon('languages')}</span><span><b>${label}</b></span></button>`).join('')}</div>`,t('language'));}

const buyerAuth=createBuyerAuth({api,apiBase:API_BASE,language:()=>state.language,escape:esc,openModal,closeModal,
  async onSession(data,after){state.token=data.token;state.user=data.user;persistSession();renderNavigation();await loadFavorites().catch(error=>toast(error.message,true));if(typeof after==='function')await after();else await navigate('home');}
});
function showAuth(after){buyerAuth.open(after);}

let modalReturnFocus;
function openModal(content,title='',wide=false){
  buyerAuth.cancel();
  if(!$('#modalRoot').firstElementChild)modalReturnFocus=document.activeElement;
  $('#modalRoot').innerHTML=`<div class="modal-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="buyerModalTitle" tabindex="-1" class="modal ${wide?'wide':''}"><div class="modal-head"><h2 id="buyerModalTitle">${esc(title)}</h2><button class="icon-button" aria-label="${esc(({ru:'Закрыть',en:'Close',uz:'Yopish'})[state.language]||'Close')}" data-close-modal>${icon('x')}</button></div><div class="modal-body">${content}</div></div></div>`;
  refreshIcons();
  const dialog=$('#modalRoot [role="dialog"]');
  const focusable=()=>Array.from(dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeModal();return;}
    if(event.key!=='Tab')return;
    const items=focusable(),first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();dialog.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){event.preventDefault();first.focus();}
  });
  (focusable()[0]||dialog).focus();
}
function closeModal(){ buyerAuth.cancel();$('#modalRoot').innerHTML='';if(modalReturnFocus?.isConnected)modalReturnFocus.focus();modalReturnFocus=null; }

async function showReviews(productId){const d=await api(`/products/${productId}/reviews`);openModal(`<div class="stat"><small>Средняя оценка</small><b>${Number(d.average_rating||0).toFixed(1)} ★</b></div><div class="settings-list" style="margin-top:14px">${(d.reviews||[]).map(r=>`<div class="list-card"><span class="avatar">${esc((r.buyer_name||'П')[0])}</span><span><b>${esc(r.buyer_name||'Покупатель')} · ${'★'.repeat(Number(r.rating||0))}</b><small>${esc(r.text||'')}</small></span></div>`).join('')||emptyState()}</div>${state.token?`<form id="reviewForm" class="form section" data-product-id="${productId}"><div class="field"><label>Оценка</label><select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></div><div class="field"><label>Комментарий</label><textarea name="text"></textarea></div><button class="button">${t('send')}</button></form>`:''}`,t('reviews'));
}

function bindGlobalEvents(){
  document.addEventListener('click',async event=>{
    const moreProducts=event.target.closest('[data-load-more-products]');if(moreProducts){moreProducts.disabled=true;loadMoreProducts().catch(error=>{if(moreProducts.isConnected)moreProducts.disabled=false;toast(error.message,true);});return;}
    const retryRoute=event.target.closest('[data-retry-route]');if(retryRoute){const route=state.route,routeData=state.routeData;try{if(route==='home'){const pending=[];if(!state.catalogLoaded)pending.push(loadProducts());if(!state.shopsLoaded)pending.push(loadShops());if(!state.categoriesLoaded)pending.push(loadCategories());const results=await Promise.allSettled(pending);const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}await navigate(route,routeData);}catch(error){$('#view').innerHTML=errorState(error);}return;}
    const offer=event.target.closest('[data-branch-offer]');if(offer){const p=state.activeProduct,o=p?.offers?.find(x=>Number(x.product_id)===Number(offer.dataset.branchOffer));if(o){state.activeProduct={...p,id:o.product_id,price:o.price,old_price:o.old_price,in_stock:o.in_stock,stock_quantity:o.stock_quantity,shop_id:o.shop_id,shop_name:o.shop_name,branch_name:o.branch_name,business_name:o.business_name,shop_address:o.address,shop_phone:o.phone,shop_working_hours:o.working_hours,shop_latitude:o.latitude,shop_longitude:o.longitude};const known=state.shops.find(s=>Number(s.id)===Number(o.shop_id));if(!known)state.shops.push({id:o.shop_id,name:o.shop_name,address:o.address,latitude:o.latitude,longitude:o.longitude});renderProductDetailsBody();refreshIcons();}return;}
    const route=event.target.closest('[data-route]');if(route){navigate(route.dataset.route);return;}
    const close=event.target.closest('[data-close-modal]');if(close||event.target.classList.contains('modal-backdrop')){closeModal();return;}
    const product=event.target.closest('[data-product]');if(product&&!event.target.closest('[data-favorite]')){navigate('product',Number(product.dataset.product));return;}
    const fav=event.target.closest('[data-favorite]');if(fav){event.stopPropagation();toggleFavorite(Number(fav.dataset.favorite),fav).catch(error=>toast(error.message,true));return;}
    const cat=event.target.closest('[data-category]');if(cat){navigate('catalog',cat.dataset.category);return;}
    const store=event.target.closest('[data-store]');if(store){showStore(Number(store.dataset.store)).catch(error=>toast(error.message,true));return;}
    const routeStore=event.target.closest('[data-store-route]');if(routeStore){openRoute(Number(routeStore.dataset.storeRoute));return;}
    const chatStart=event.target.closest('[data-product-chat]');if(chatStart){startChat(Number(chatStart.dataset.productChat)).catch(error=>toast(error.message,true));return;}
    const thread=event.target.closest('[data-chat]');if(thread){const row=state.chats.find(c=>Number(c.chat_id||c.id)===Number(thread.dataset.chat));openChat(Number(thread.dataset.chat),row?.shop_name).catch(error=>toast(error.message,true));return;}
    if(event.target.closest('[data-chat-photo]')){$('#filePicker').click();return;}
    if(event.target.closest('#chatSend')){sendChatMessage().catch(e=>toast(e.message,true));return;}
    if(event.target.closest('.mobile-chat-back')){$('#chatRoom').classList.add('hidden-mobile');return;}
    if(event.target.closest('[data-auth]')){showAuth();return;}
    if(event.target.closest('[data-logout]')){logout();return;}
    if(event.target.closest('[data-wallet-qr]')){showQr().catch(e=>toast(e.message,true));return;}
    if(event.target.closest('[data-wallet]')){showWallet().catch(e=>toast(e.message,true));return;}
    if(event.target.closest('[data-account]')){showAccount();return;}
    if(event.target.closest('[data-saved-card]')){showSavedCard();return;}
    if(event.target.closest('[data-interests]')){showInterests().catch(e=>toast(e.message,true));return;}
    if(event.target.closest('[data-help]')){showHelp();return;}
    if(event.target.closest('[data-action="language"]')){showLanguage();return;}
    const lang=event.target.closest('[data-language]');if(lang){const route=state.route,routeData=state.routeData;state.language=lang.dataset.language;state.products=[];persistSession();closeModal();await loadCategories();navigate(route,routeData);return;}
    if(event.target.closest('[data-auth-phone]')){buyerAuth.changePhone();return;}
    if(event.target.closest('[data-auth-resend]')){await buyerAuth.resend();return;}
    if(event.target.closest('[data-product-image]')){state.productImageIndex=Number(event.target.closest('[data-product-image]').dataset.productImage);renderProductDetailsBody();refreshIcons();return;}
    if(event.target.closest('[data-back-catalog]')){navigate('catalog');return;}
    const reviews=event.target.closest('[data-product-reviews]');if(reviews){showReviews(Number(reviews.dataset.productReviews));return;}
    if(event.target.closest('[data-delete-account]')){if(confirm('Удалить аккаунт без возможности восстановления?')){await api('/users/me',{method:'DELETE'});closeModal();logout();}return;}
    if(event.target.closest('[data-remove-card]')){localStorage.removeItem('mm_web_card');closeModal();toast('Карта удалена');return;}
    const confirmPurchase=event.target.closest('[data-confirm-purchase]');if(confirmPurchase){await api(`/rewards/customer/transactions/${confirmPurchase.dataset.confirmPurchase}/confirm`,{method:'POST',body:'{}'});closeModal();toast('Оплата подтверждена');return;}
  });
  document.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target;
    try{
      if(form.id==='authForm'){await buyerAuth.submit(form,event.submitter?.value);return;}
      if(form.id==='accountForm'){const fd=new FormData(form);const d=await api('/users/me/profile',{method:'PUT',body:JSON.stringify({name:fd.get('name'),language_code:state.language})});state.user=d.user;const avatar=fd.get('avatar');if(avatar?.size){const upload=new FormData();upload.append('avatar',avatar);const avatarResult=await api('/users/me/avatar',{method:'PUT',body:upload});state.user=avatarResult.user||state.user;}persistSession();closeModal();renderProfile();}
      if(form.id==='cardForm'){const fd=new FormData(form);localStorage.setItem('mm_web_card',JSON.stringify({number:fd.get('number'),expiry:fd.get('expiry')}));closeModal();toast('Карта сохранена');}
      if(form.id==='interestsForm'){const fd=new FormData(form);const categories=fd.getAll('category');if(categories.length!==3)throw new Error('Выберите ровно три категории.');await api('/users/me/preferences',{method:'POST',body:JSON.stringify({categories})});closeModal();toast('Интересы сохранены');}
      if(form.id==='reviewForm'){const fd=new FormData(form);await api(`/products/${form.dataset.productId}/reviews`,{method:'POST',body:JSON.stringify({rating:Number(fd.get('rating')),text:fd.get('text')})});closeModal();toast('Отзыв сохранён');}
    }catch(error){toast(error.message,true);}
  });
  const suggest=debounce(async (event,requestId)=>{if(requestId!==state.searchSuggestionId)return;const q=event.target.value.trim();$('#clearSearch').classList.toggle('hidden',!q);if(!q){$('#searchSuggestions').classList.add('hidden');return;}try{const rows=await api(`/search/suggestions?q=${encodeURIComponent(q)}&lang=${state.language}`);if(requestId!==state.searchSuggestionId)return;$('#searchSuggestions').innerHTML=rows.slice(0,8).map(x=>`<button class="suggestion" data-search="${esc(x.title||x.text||x.query||'')}">${icon('search')} ${esc(x.title||x.text||x.query||'')}</button>`).join('');$('#searchSuggestions').classList.toggle('hidden',!rows.length);refreshIcons();}catch{}},250);
  $('#globalSearch').addEventListener('input',event=>suggest(event,++state.searchSuggestionId));
  $('#globalSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){const q=event.target.value.trim();if(q){$('#searchSuggestions').classList.add('hidden');navigate('search',q);}}});
  $('#clearSearch').addEventListener('click',()=>{state.searchSuggestionId++;$('#globalSearch').value='';$('#clearSearch').classList.add('hidden');$('#searchSuggestions').classList.add('hidden');});
  $('#filePicker').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;state.pendingFile=file;const url=URL.createObjectURL(file);$('#attachmentPreview').innerHTML=`<div class="attachment-preview"><img src="${url}" alt=""><b>${esc(file.name)}</b><button class="icon-button" data-remove-attachment>${icon('x')}</button></div>`;updateSendButton();refreshIcons();event.target.value='';});
  document.addEventListener('input',event=>{if(event.target.id==='chatInput')updateSendButton();});
  document.addEventListener('change',event=>{if(event.target.matches('#interestsForm input[type="checkbox"]'))event.target.closest('.chip')?.classList.toggle('active',event.target.checked);});
  document.addEventListener('click',event=>{const s=event.target.closest('[data-search]');if(s){$('#globalSearch').value=s.dataset.search;$('#searchSuggestions').classList.add('hidden');navigate('search',s.dataset.search);}if(event.target.closest('[data-remove-attachment]')){state.pendingFile=null;$('#attachmentPreview').innerHTML='';updateSendButton();}});
}
function updateSendButton(){const btn=$('#chatSend');if(!btn)return;btn.classList.toggle('hidden-send',!$('#chatInput').value.trim()&&!state.pendingFile);}
function debounce(fn,delay){let id;return(...args)=>{clearTimeout(id);id=setTimeout(()=>fn(...args),delay);};}

bootstrap().catch(error=>{console.error(error);toast(error.message,true);});
