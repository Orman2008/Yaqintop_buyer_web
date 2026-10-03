// The buyer app uses phone verification for both sign-in and registration.
export function createBuyerAuth({api, apiBase, language, escape, openModal, closeModal, onSession}) {
  let current = null;
  const getForm = () => document.querySelector('#authForm');
  function render() {
    const flow = current;
    if (!flow) return;
    let fields;
    if (flow.stage === 'phone') {
      fields = `<div class="field"><label for="authPhone">Номер телефона</label><div class="auth-phone"><span>+998</span><input id="authPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="90 123 45 67" value="${escape(flow.phone.slice(4))}" required></div><small class="field-note">Введите 9 цифр после +998. Код придёт в Telegram или по SMS.</small></div><button class="button" name="channel" value="telegram">Получить код в Telegram</button><button class="button soft" name="channel" value="sms">Получить код по SMS</button>`;
    } else if (flow.stage === 'code') {
      fields = `<p class="auth-copy">Код отправлен ${flow.channel === 'sms' ? 'по SMS' : 'в Telegram'} на ${escape(flow.phone)}.</p><div class="field"><label for="authCode">Код подтверждения</label><input id="authCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${flow.codeLength}}" maxlength="${flow.codeLength}" placeholder="${'0'.repeat(flow.codeLength)}" required></div><button class="button">Подтвердить</button>${flow.channel === 'telegram' ? '<a class="button soft" href="https://telegram.org/apps" target="_blank" rel="noopener">Открыть Telegram</a>' : ''}<button type="button" class="button soft" data-auth-resend>Получить новый код по SMS</button><button type="button" class="button ghost" data-auth-phone>Изменить номер</button>`;
    } else {
      fields = `<div class="field"><label for="authName">Ваше имя</label><input id="authName" name="name" autocomplete="name" maxlength="100" placeholder="Например, Лола" required></div><label class="auth-legal"><input type="checkbox" name="legal" required><span>Я принимаю <a href="${escape(apiBase)}/legal/buyer/terms" target="_blank" rel="noopener">условия использования</a> и <a href="${escape(apiBase)}/legal/buyer/privacy" target="_blank" rel="noopener">политику конфиденциальности</a>.</span></label><button class="button">Создать аккаунт</button>`;
    }
    document.querySelector('.modal-body').innerHTML = `<div class="auth-intro"><img class="auth-logo" src="assets/mapmarket-logo.png" alt="MapMarket"><div><p class="eyebrow">MAPMARKET</p><h2>${flow.stage === 'name' ? 'Создание аккаунта' : 'Вход для покупателей'}</h2><p class="auth-copy">Вход и регистрация по номеру телефона, как в приложении. Пароль не нужен.</p></div></div><form id="authForm" class="form">${fields}<p id="authError" class="auth-error" role="alert" hidden></p></form>`;
  }
  async function submit(form, channel) {
    const flow = current;
    if (!flow || flow.busy) return;
    const fd = new FormData(form);
    const errorElement = document.querySelector('#authError');
    errorElement.hidden = true;
    try {
      let endpoint, payload;
      if (flow.stage === 'phone' || channel) {
        if (flow.stage === 'phone') flow.phone = '+998' + String(fd.get('phone') || '').replace(/\D/g, '');
        if (!/^\+998\d{9}$/.test(flow.phone)) throw new Error('Введите 9 цифр после +998.');
        endpoint = 'request';
        payload = {phone: flow.phone, client: 'buyer', channel: channel || 'telegram'};
      } else if (flow.stage === 'code') {
        const code = String(fd.get('code') || '').trim();
        if (!new RegExp(`^\\d{${flow.codeLength}}$`).test(code)) throw new Error(`Введите код из ${flow.codeLength} цифр.`);
        endpoint = 'verify';
        payload = {phone: flow.phone, client: 'buyer', code};
      } else {
        const name = String(fd.get('name') || '').trim();
        if (!name || !fd.has('legal')) throw new Error('Введите имя и примите условия.');
        endpoint = 'complete';
        payload = {signup_token: flow.signupToken, name, language_code: language(), accept_privacy: true, accept_terms: true};
      }
      flow.busy = true;
      form.querySelectorAll('button,input').forEach(element => element.disabled = true);
      const data = await api(`/auth/passwordless/${endpoint}`, {method: 'POST', auth: false, body: JSON.stringify(payload)});
      // Closing/replacing the modal invalidates pending OTP responses.
      if (current !== flow) return;
      if (endpoint === 'request') {
        flow.stage = 'code';
        flow.channel = data.delivery_channel || payload.channel;
        const length = Number(data.code_length);
        flow.codeLength = length >= 4 ? Math.min(8, Math.floor(length)) : 6;
        render();
      } else if (data.registration_required) {
        if (!data.signup_token) throw new Error('Не удалось начать регистрацию. Запросите код снова.');
        flow.signupToken = data.signup_token;
        flow.stage = 'name';
        render();
      } else {
        const token = data.token || data.access_token;
        if (!token || !data.user) throw new Error('Сервер не вернул сессию покупателя.');
        closeModal();
        await onSession({token, user: data.user}, flow.after);
      }
    } catch (error) {
      if (current === flow) { errorElement.textContent = error.message; errorElement.hidden = false; }
    } finally {
      flow.busy = false;
      if (current === flow) getForm()?.querySelectorAll('button,input').forEach(element => element.disabled = false);
    }
  }
  return {
    open(after) {
      openModal('');
      current = {stage: 'phone', phone: '', codeLength: 6, channel: 'telegram', signupToken: '', busy: false, after};
      render();
    },
    cancel() { current = null; },
    submit,
    changePhone() { if (current && !current.busy) { current.stage = 'phone'; current.signupToken = ''; render(); } },
    resend() { return submit(getForm(), 'sms'); },
  };
}
