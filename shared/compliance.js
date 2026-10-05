import {esc,field,select,submit,toast} from './ui.js';
export const documentNames={terms:'Условия использования',privacy:'Конфиденциальность',seller_terms:'Условия продавца',marketplace_rules:'Правила маркетплейса'};
export const verificationNames={unverified:'Не проверено',pending:'На проверке',verified:'Подтверждено',rejected:'Отклонено'};
export const sellerTypes=[['individual_entrepreneur','Индивидуальный предприниматель'],['legal_entity','Юридическое лицо'],['self_employed','Самозанятый']];
export const rankingHelp=()=>`<section class="card"><h1>Как формируется выдача</h1><p>Выдача учитывает соответствие запросу и выбранным фильтрам. В каталоге могут использоваться популярность и рейтинг; доступны сортировки по цене и новизне. На карте учитывается выбранная область.</p><p>Приоритет подписки применяется отдельно от органических факторов в тех режимах каталога, где он включён. Такие товары помечены «Приоритетное размещение». Сортировка по цене сохраняет выбранный порядок цены. Это не рекламная маркировка.</p><p>Наличие, цена, рейтинг и расстояние помогают сравнивать предложения. Их доступность зависит от запроса. Мы не заявляем, что каждый из этих факторов имеет вес в каждом режиме.</p></section>`;
export const placementLabel=p=>p.sponsored?'<button type="button" class="chip" data-ranking>Реклама</button>':p.promoted?'<button type="button" class="chip" data-ranking>Приоритетное размещение</button>':'';
export function paymentStateView(payment={}){
 const names={provider_unavailable:'Платёжный провайдер пока не подключён',initializing:'Платёж создаётся',pending:'Ожидается подтверждение провайдера',authorized:'Ожидается подтверждение провайдера',paid:'Оплачено',failed:'Платёж не прошёл',cancelled:'Платёж отменён',refunded:'Возврат подтверждён'};
 const status=payment.state||payment.status||'provider_unavailable';
 return `<section class="card" role="status"><h2>${esc(names[status]||'Статус платежа недоступен')}</h2>${payment.transaction_id?`<p>Сделка: ${esc(payment.transaction_id)}</p>`:''}${payment.amount!=null?`<p>${esc(payment.amount)} ${esc(payment.currency)}</p>`:''}<p>Оплата товара выполняется через лицензированного провайдера продавцу. Здесь не вводятся и не сохраняются данные карты.</p></section>`;
}
let pendingGate;
export function ensureLegalAcceptance(request){
 if(pendingGate)return pendingGate;
 pendingGate=legalGate(request).finally(()=>{pendingGate=null;});return pendingGate;
}
async function legalGate(request){
 const result=await request('/marketplace/legal/required');
 if(!result.documents?.length)return true;
 const modal=document.createElement('dialog');modal.className='web-dialog';modal.setAttribute('aria-label','Новые версии документов');
 modal.innerHTML=`<div class="modal-body"><h2>Новые версии документов</h2><p>Ознакомьтесь с документами и явно подтвердите согласие, чтобы продолжить работу в аккаунте.</p><form class="form">${result.documents.map((d,i)=>`<section><h3>${esc(documentNames[d.document_type]||d.document_type)} · ${esc(d.version)}</h3><div class="legal-copy" style="white-space:pre-wrap;max-height:35vh;overflow:auto" tabindex="0">${esc(d.content)}</div><label class="field"><span><input type="checkbox" name="accepted_${i}" required> Я ознакомился и принимаю эту версию</span></label></section>`).join('')}<p class="form-error" role="alert"></p><div class="actions"><button class="button" type="submit">Принять выбранные версии</button><button class="button soft" type="button" data-cancel>Вернуться</button></div></form></div>`;
 document.body.append(modal);modal.addEventListener('cancel',event=>event.preventDefault());modal.showModal();
 return new Promise(resolve=>{
  const finish=value=>{modal.close();modal.remove();resolve(value);};
  modal.querySelector('[data-cancel]').onclick=()=>finish(false);
  const form=modal.querySelector('form');form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;submit(form,async()=>{await request('/marketplace/legal/acceptances',{method:'POST',body:{documents:result.documents.map(d=>({document_type:d.document_type,version:d.version}))}});finish(true);});};
 });
}
export async function sellerComplianceView(request,endpoint){
 const data=await request(endpoint),seller=data.seller||{},license=data.license||{};
 return `<div class="page-head"><h1>Проверка продавца</h1></div><section class="card"><h2>${esc(verificationNames[seller.verification_status]||verificationNames.unverified)}</h2>${seller.rejection_reason?`<p role="alert">${esc(seller.rejection_reason)}</p>`:''}<form id="sellerVerification" class="form">${select('Тип продавца','seller_type',sellerTypes,seller.seller_type||'individual_entrepreneur')}${field('Юридическое имя','legal_name',seller.legal_name||'','text','required maxlength="250"')}${field('Налоговый ID — не публикуется','tax_id',seller.tax_id||'','text','required maxlength="40" autocomplete="off"')}<p class="muted">Решение принимает администратор. Новая отправка переводит заявку на проверку.</p><p class="form-error" role="alert"></p><button class="button">${seller.verification_status==='rejected'?'Исправить и отправить повторно':'Отправить заявку'}</button></form></section>${license.required_license?`<section class="card section"><h2>Лицензия этого магазина / филиала</h2><p>${esc(verificationNames[license.license_status]||'Не проверено')}</p>${license.license_rejection_reason?`<p role="alert">${esc(license.license_rejection_reason)}</p>`:''}<form id="sellerLicense" class="form">${field('Номер лицензии','license_number',license.license_number||'','text','required maxlength="160"')}${field('Срок действия','license_expiry',String(license.license_expiry||'').slice(0,10),'date','required')}<p class="form-error" role="alert"></p><button class="button">Отправить лицензию на проверку</button></form></section>`:''}`;
}
export function bindSellerCompliance(request,endpoint,refresh){
 for(const [id,path] of [['sellerVerification',endpoint],['sellerLicense',endpoint+'/license']]){
  const form=document.getElementById(id);if(!form)continue;
  form.onsubmit=event=>{event.preventDefault();submit(form,async body=>{await request(path,{method:id==='sellerLicense'?'PUT':'POST',body});toast('Заявка отправлена на проверку');await refresh();});};
 }
}
