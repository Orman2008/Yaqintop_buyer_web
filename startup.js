// Keep startup failures actionable even when an imported module cannot load.
(() => {
  const deadline = setTimeout(() => {
    if (window.YAQINTOP_BUYER_STARTED) return;
    const view = document.querySelector('#view');
    if (!view) return;
    view.replaceChildren();
    const panel = document.createElement('div');
    panel.className = 'empty startup-error';
    const title = document.createElement('h2');
    title.textContent = 'Не удалось открыть YAQINTOP MARKET';
    const text = document.createElement('p');
    text.textContent = 'Файлы сайта не загрузились. Обновите страницу и повторите попытку.';
    const retry = document.createElement('button');
    retry.className = 'button';
    retry.textContent = 'Обновить страницу';
    retry.onclick = () => window.location.reload();
    panel.append(title, text, retry);
    view.append(panel);
  }, 10000);
  window.addEventListener('yaqintop:started', () => clearTimeout(deadline), { once: true });
})();
