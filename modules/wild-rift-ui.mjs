import {emptyDraft,sanitizeDraft,recommendations,recommendBuild,coaching,threats,freshness,ROLES} from './wild-rift-engine.mjs?v=20260923-wr1';
import {RANKS,traits,BOOT_UPGRADES} from './wild-rift-knowledge.mjs?v=20260923-wr1';
import {itemName,termName} from './wild-rift-tr.mjs?v=20260923-wr1';
let data=null,draft=emptyDraft(),root=null,picker=null,queryTimer=null,controller=null,updating=false,pollTimer=null,pollResolve=null,owner=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const champ=id=>data.champions.find(c=>c.id===id);
const date=v=>v?new Date(v).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'}):'Belirtilmemiş';
const toast=(message,type='info')=>window.showToast?.(message,type);
function errorInTurkish(error){
  if(error?.name==='TimeoutError')return 'Veri servisi zamanında yanıt vermedi. Mevcut öneriler korunuyor.';
  if(error?.name==='AbortError')return 'İşlem iptal edildi.';
  if(error instanceof TypeError)return 'Veri servisine bağlanılamadı. Bağlantıyı ve sunucu adresini kontrol et.';
  if(String(error?.code||'').startsWith('auth/'))return 'Oturum doğrulanamadı. Yeniden giriş yapıp tekrar dene.';
  return error?.message||'İşlem tamamlanamadı. Mevcut öneriler korunuyor.';
}
const safeUrl=url=>{try{const u=new URL(url);return ['www.wildriftfire.com','www.mobafire.com','wildrift.leagueoflegends.com'].includes(u.hostname)&&u.protocol==='https:'?u.href:'#';}catch{return '#';}};
function image(url,name){return `<img src="${esc(safeUrl(url))}" alt="${esc(name)}" loading="lazy" decoding="async" width="44" height="44" referrerpolicy="no-referrer">`;}
function bindImageFallback(scope){scope.querySelectorAll('img').forEach(img=>{img.onerror=()=>{const fallback=document.createElement('span');fallback.className='wr-image-fallback';fallback.textContent=img.alt.slice(0,2).toLocaleUpperCase('tr-TR');fallback.setAttribute('aria-hidden','true');img.replaceWith(fallback);};});}
function remember(){try{localStorage.setItem('gm_wr_draft_'+owner,JSON.stringify(draft));}catch{} }
function active(){return window.isSiteAdmin?.()&&owner===window.currentUser?.uid;}
function apiUrl(suffix=''){
  const base=window.WILD_RIFT_API_BASE||'';
  if(base && !/^https:\/\//.test(base))throw new Error('Veri servisi HTTPS adresiyle yapılandırılmalı.');
  return (base?base.replace(/\/$/,''):'')+'/api/wild-rift'+suffix;
}
async function api(suffix='',method='GET'){
  if(!active())throw new Error('Yönetici oturumu gerekli.');
  const token=await window.auth.currentUser.getIdToken();
  const response=await fetch(apiUrl(suffix),{method,headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Güncelleme servisi bağlı değil. Yerel sunucuyu başlat veya yayın sunucusunu yapılandır.');
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Veri servisine ulaşılamadı.');return result;
}
function accept(payload){
  if(payload.schema!==1||!Array.isArray(payload.champions)||payload.champions.length<80||!payload.stats?.brackets?.diamond||!payload.items)throw new Error('Veri paketi doğrulanamadı.');
  data=payload;draft=sanitizeDraft(draft,data);
}
export async function mount(){
  if(!window.isSiteAdmin?.())return;
  owner=window.currentUser.uid;
  controller?.abort();controller=new AbortController();root=document.getElementById('wr-root');
  if(!document.getElementById('wr-css')){const link=document.createElement('link');link.id='wr-css';link.rel='stylesheet';link.href=new URL('../wild-rift.css?v=20260923-wr1',import.meta.url).href;document.head.append(link);}
  root.innerHTML='<div class="wr-empty" role="status">Wild Rift verileri hazırlanıyor…</div>';
  if(!data){
    try{accept(await api());}
    catch(e){
      if(!active())return;
      try{const response=await fetch(new URL('../data/wild-rift.json',import.meta.url),{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw Error();accept(await response.json());}
      catch{root.innerHTML='<div class="wr-empty">Veriler yüklenemedi. Bağlantını kontrol edip paneli yeniden aç.</div>';return;}
    }
  }
  if(!active())return;
  try{draft=sanitizeDraft(JSON.parse(localStorage.getItem('gm_wr_draft_'+owner)),data);}catch{draft=emptyDraft();}
  root.onclick=handleClick;root.onchange=handleChange;render();
}
function header(){
  const status=freshness(data),own=champ(draft.blue[draft.role]);
  return `<header class="wr-hero"><div><span class="wr-eyebrow">YÖNETİCİ ÖNİZLEMESİ · WILD RIFT</span><h1>Seçimini avantaja çevir.</h1><p>Rakibi seç. Takımını tamamla. Maç planını hazırla.</p></div><button class="secondary" data-action="back">← Ana sayfa</button></header>
    <div class="wr-status"><span><i class="wr-dot ${status.stale?'wr-warn':''}"></i> Resmî yama <b>${esc(data.latestPatch.version)}</b></span><span>İstatistik: ${esc(data.stats.asOf)} · Çin sunucusu</span><button class="secondary" data-action="refresh" ${updating?'disabled':''}>${updating?'Veriler güncelleniyor…':'↻ Güncel verileri kontrol et'}</button></div>
    ${status.stale||!status.statsCurrent?'<div class="wr-notice">Verilerin bir bölümü eski olabilir. Yama ve kaynak tarihlerini kontrol et; eski veriler güncel kazanma oranı olarak puanlanmaz.</div>':''}
    <div id="wr-update-message" role="status" aria-live="polite"></div>
    <section class="wr-controls"><label>Benim rolüm<select id="wr-role">${Object.entries(ROLES).map(([id,n])=>`<option value="${id}" ${id===draft.role?'selected':''}>${n}</option>`).join('')}</select></label><label>İstatistik ligi<select id="wr-rank">${Object.entries(RANKS).map(([id,n])=>`<option value="${id}" ${id===draft.rank?'selected':''}>${n}</option>`).join('')}</select></label><div class="wr-own"><small>KONTROL ETTİĞİN ŞAMPİYON</small><button class="secondary" data-action="pick" data-side="blue" data-role="${draft.role}">${own?image(own.portrait,own.name):'<span class="wr-plus">＋</span>'}<b>${esc(own?.name||'Şampiyonunu seç')}</b></button></div></section>`;
}
function team(side){
  return `<section class="wr-team ${side}"><div class="wr-team-title"><h2>${side==='blue'?'Mavi takım':'Kırmızı takım'}</h2><span>${side==='blue'?'BİZİM TAKIMIMIZ':'RAKİP TAKIM'}</span></div>${Object.entries(ROLES).map(([role,name])=>{
    const c=champ(draft[side][role]);return `<div class="wr-slot ${side==='blue'&&role===draft.role?'wr-mine':''}"><button class="wr-slot-pick" data-action="pick" data-side="${side}" data-role="${role}">${c?image(c.portrait,c.name):'<span class="wr-placeholder">＋</span>'}<span><small>${name}${side==='blue'&&role===draft.role?' · SEN':''}</small><b>${esc(c?.name||'Seçim bekleniyor')}</b>${c&&!c.roles.includes(role)?'<small class="wr-warning">Alışılmış rol dışında · veri sınırlı</small>':''}</span></button>${c?`<button class="wr-clear" data-action="remove" data-side="${side}" data-role="${role}" aria-label="${name} seçimini kaldır">×</button>`:''}</div>`;
  }).join('')}</section>`;
}
function render(){
  if(!active()||!root)return;
  const tabs={counters:'Karşı seçimler',build:'Eşya dizilimi',coach:'Oyun planı',team:'Takım dengesi',patch:'Yama ve kaynaklar'};
  root.innerHTML=header()+`<div class="wr-teams">${team('blue')}${team('red')}</div><div class="wr-tools"><button class="secondary" data-action="bans">Yasaklar (${draft.bans.length})</button><button class="secondary" data-action="pool">Şampiyon havuzum (${draft.pool.length||'Tümü'})</button><button class="secondary" data-action="reset">Seçimleri temizle</button><span>Seçimler bu hesap için bu cihazda saklanır.</span></div><nav class="wr-tabs" aria-label="Wild Rift bölümleri">${Object.entries(tabs).map(([id,n])=>`<button data-action="tab" data-tab="${id}" aria-current="${draft.tab===id?'page':'false'}">${n}</button>`).join('')}</nav><div class="wr-content">${draft.tab==='counters'?counterView():draft.tab==='build'?buildView():draft.tab==='coach'?coachView():draft.tab==='team'?teamView():patchView()}</div><footer class="wr-foot">Öneriler istatistik, rehber eşleşmeleri ve açıklanabilir kurallara dayanır. Uygunluk sırası kazanma olasılığı değildir.</footer><dialog id="wr-picker" class="wr-dialog" aria-labelledby="wr-picker-title"></dialog>`;
  bindImageFallback(root);
  remember();
}
function counterView(){
  const list=recommendations(data,draft).slice(0,8),enemy=champ(draft.red[draft.role]);
  return `<div class="wr-section-head"><div><h2>${ROLES[draft.role]} için öneriler</h2><p>${enemy?esc(enemy.name)+' eşleşmesi ve girilmiş rakip takım birlikte değerlendiriliyor.':'Bu koridorun rakibini seçerek eşleşme önerilerini güçlendir.'}</p></div><span class="wr-pill">${Object.values(draft.red).length}/5 rakip belli</span></div><div class="wr-recommendations">${list.map((r,i)=>`<article class="wr-rec"><div class="wr-rec-head"><span class="wr-rank">${i+1}</span>${image(r.champion.portrait,r.champion.name)}<div><h3>${esc(r.champion.name)}</h3><small>${esc(r.evidence)}</small></div><span class="wr-tier">${esc(r.tier||'?')}<small>META</small></span></div><ul>${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${r.risks.length?`<p class="wr-risk">${r.risks.map(esc).join(' ')}</p>`:''}<div class="wr-rec-bottom"><span>${r.stat?`Genel kazanma: %${r.stat.win.toFixed(2).replace('.',',')}<small>Bu rakibe özel oran değildir.</small>`:'Bu lig/rol için istatistik yok.'}</span><button data-action="choose" data-id="${r.champion.id}">Şampiyonumu seç</button></div></article>`).join('')||'<div class="wr-empty">Bu rol ve havuz için kullanılabilir şampiyon kalmadı. Yasakları veya havuzunu düzenle.</div>'}</div>`;
}
function itemCard(id,index,change){
  const item=data.items[id];return `<div class="wr-item">${image(item?.icon,itemName(id))}<div><small>${index+1}. TERCİH</small><b>${esc(itemName(id))}</b><p>${esc(change?.label||'Şampiyonun kaynak rehberindeki temel tercih.')}</p>${BOOT_UPGRADES[id]?`<p>10. dakikadan sonra: <b>${BOOT_UPGRADES[id]}</b> · aynı yuva</p>`:''}<label class="wr-check"><input type="checkbox" data-lock="${id}" ${draft.locked.includes(id)?'checked':''}> Satın aldım, koru</label></div></div>`;
}
function buildView(){
  const result=recommendBuild(data,draft);
  if(!result.champion)return '<div class="wr-empty">Tam eşya dizilimini görmek için mavi takımdan kontrol ettiğin şampiyonu seç.</div>';
  if(result.missing)return '<div class="wr-empty">Bu şampiyonun seçili rolü için doğrulanmış dizilim yok. Rolünü kontrol et veya kaynaklar güncellenince yeniden dene.</div>';
  const {base,final,changes,alternatives}=result;
  return `<div class="wr-section-head"><div><h2>${esc(result.champion.name)} · Maça özel dizilim</h2><p>İlk iki ana eşya korunur; uygun alternatifler rakibin tehditlerine göre değerlendirilir.</p></div><a href="${safeUrl(base.source)}" target="_blank" rel="noopener noreferrer">Kaynak rehber ↗</a></div>${!result.current?'<div class="wr-notice">Bu rehber güncel yamayla doğrulanmadı. Son bilinen dizilim gösteriliyor; otomatik eşya değişiklikleri durduruldu.</div>':''}
    <label class="wr-fed">Rakipte kim önde?<select id="wr-fed"><option value="">Belli değil / seçim aşamasındayım</option>${Object.values(draft.red).map(id=>`<option value="${id}" ${draft.fed===id?'selected':''}>${esc(champ(id)?.name)}</option>`).join('')}</select></label>
    <div class="wr-purchase"><b>Başlangıç</b><span>${base.starting.map(id=>esc(itemName(id))).join(' + ')}</span><b>İlk dönüş</b><span>${esc(itemName(base.core[0]||base.final[0]))} için parça biriktir; koridor baskısına göre botu öne al.</span></div>
    <div class="wr-build">${final.map((id,i)=>itemCard(id,i,changes.find(c=>c.to===id))).join('')}</div>
    ${changes.length?`<div class="wr-adapted"><h3>Bu maç için değişenler</h3>${changes.map(c=>`<p><b>${esc(itemName(c.from))} → ${esc(itemName(c.to))}</b> · ${c.label}. Temel dizilimin bu slotundaki avantajından vazgeçiliyor.</p>`).join('')}</div>`:'<p class="wr-muted">Girilen tehditler için ana dizilimi bozmadan uygulanabilecek öncelikli değişiklik yok.</p>'}
    <div class="wr-detail-grid"><section><h3>Rünler</h3><div class="wr-chips">${base.runes.map(r=>`<span>${esc(termName(r))}</span>`).join('')}</div><h3>Sihirdar büyüleri</h3><div class="wr-chips">${base.spells.map(r=>`<span>${esc(termName(r))}</span>`).join('')}</div></section><section><h3>Yetenek sırası · seviye 1–15</h3><div class="wr-skills">${base.skillOrder.map((r,i)=>`<span title="${i+1}. seviye"><small>${i+1}</small>${r===4?'U':r||'?'}</span>`).join('')}</div><p class="wr-muted">1, 2, 3: temel yetenekler · U: ulti</p></section></div>
    <details class="wr-details"><summary>Duruma bağlı alternatifler (${alternatives.length})</summary>${alternatives.map(a=>`<p><b>${a.label}:</b> ${esc(itemName(a.from))} → ${esc(itemName(a.to))}${draft.locked.includes(a.from)?' · Satın aldığın için korunuyor.':''}</p>`).join('')||'<p>Kaynakta bu rol için ek alternatif belirtilmemiş.</p>'}</details><p class="wr-muted">Rehber yaması: ${esc(base.patch)} · Alınma zamanı: ${date(result.champion.fetchedAt)}</p>`;
}
function coachView(){const tips=coaching(data,draft);return `<h2>Koridordan takım savaşına oyun planı</h2>${tips.length?`<div class="wr-coach">${tips.map((tip,i)=>`<article><span>${i+1}</span><p>${esc(tip)}</p></article>`).join('')}</div><p class="wr-muted">Bunlar eşleşme özelliklerine dayanan oyun ilkeleridir. Rakibin anlık yetenek bekleme süreleri veya altını otomatik okunmaz.</p>`:'<div class="wr-empty">Önce kendi şampiyonunu seç.</div>'}`;}
function teamView(){
  const t=threats(data,draft),labels={physical:'Fiziksel hasar',magic:'Büyü hasarı',mixed:'Karma hasar',heal:'İyileşme',shield:'Kalkan',tank:'Dayanıklılık',cc:'Kontrol etkisi',burst:'Ani hasar',poke:'Menzilli baskı',attack:'Normal saldırı',engage:'Savaşı başlatma'};
  const allies=Object.values(draft.blue).map(champ).filter(Boolean),missing=[];
  if(allies.length&&!allies.some(c=>traits(c).tank))missing.push('Seçili mavi takımda belirgin bir ön saf tankı yok.');
  if(allies.length&&!allies.some(c=>traits(c).engage))missing.push('Savaşı başlatma araçları sınırlı; görüş ve yakalama fırsatları önemli.');
  if(allies.length>1&&allies.every(c=>traits(c).damage==='physical'))missing.push('Hasar fiziksel ağırlıklı; rakibin zırh yatırımı değer kazanabilir.');
  return `<h2>Rakibin tehdit haritası</h2><p class="wr-muted">Koridor rakibi ve önde seçilen rakip daha fazla ağırlık taşır. Bu grafik gerçek hasar ölçümü değildir.</p><div class="wr-threats">${Object.entries(t).map(([k,v])=>`<div><span>${labels[k]}</span><meter min="0" max="7" value="${v}" aria-label="${labels[k]}"></meter><small>${v===0?'Belirgin değil':v>=3?'Yüksek':'Mevcut'}</small></div>`).join('')}</div><h3>Mavi takımın ihtiyaçları</h3>${missing.map(x=>`<p>${x}</p>`).join('')||'<p>Şu anki seçimlerde belirgin bir eksik saptanmadı.</p>'}<p class="wr-muted">${5-allies.length} mavi takım yuvası ve ${5-Object.values(draft.red).length} rakip yuvası henüz boş. Boş yuvalar biliniyormuş gibi hesaba katılmaz.</p>`;
}
function patchView(){
  const builds=data.champions.flatMap(c=>c.builds||[]),current=builds.filter(b=>b.patch===data.latestPatch.version).length;
  return `<h2>Veri durumu ve kaynaklar</h2><div class="wr-metrics"><div><b>${data.champions.length}</b><span>Şampiyon</span></div><div><b>${current}/${builds.length}</b><span>Yamayla eşleşen rol rehberi</span></div><div><b>${Object.keys(data.items).length}</b><span>Dizilimlerdeki eşya</span></div></div><dl class="wr-source-list"><dt>Son resmî yama</dt><dd><a target="_blank" rel="noopener noreferrer" href="${safeUrl(data.latestPatch.url)}">${esc(data.latestPatch.version)} · Türkçe yama notları ↗</a></dd><dt>Resmî yayım zamanı</dt><dd>${date(data.latestPatch.publishedAt)}</dd><dt>Son başarılı kontrol</dt><dd>${date(data.checkedAt)}</dd><dt>İstatistik sürümü</dt><dd>${esc(data.stats.patch)} · ${esc(data.stats.asOf)}</dd><dt>İstatistik kapsamı</dt><dd>Çin sunucusu · ${RANKS[draft.rank]} · Örneklem sayısı kaynakta belirtilmiyor.</dd><dt>İstatistik ve rehber sağlayıcısı</dt><dd><a href="https://www.wildriftfire.com/stats" target="_blank" rel="noopener noreferrer">WildRiftFire ↗</a></dd><dt>Son kontrolde değişen rehber</dt><dd>${data.changes?.length||0}</dd><dt>Yenilenemeyen rehber</dt><dd>${data.failures?.length||0}</dd></dl><details class="wr-details"><summary>Sıralama nasıl çalışıyor?</summary><p>Rolün meta seviyesi temel alınır. Güncel genel kazanma oranının etkisi sınırlıdır. Kaynak rehberde belirtilmiş karşı seçimler ve takım uyumu değerlendirmeyi değiştirir. Doğrudan eşleşme kazanma oranı kullanılmaz.</p><p>Bir rehberdeki yama etiketi bağımsız bir performans garantisi değildir. Eşyalar şampiyona ve role özel kaynak diziliminden seçilir; açıklanabilir durum kurallarıyla sınırlı değişiklik yapılır. Oyun istemcisiyle çelişen bilgi yeniden doğrulanmalıdır.</p><p>Sunucu çalışırken altı saatte bir kontrol yapılır. Yayınlanan statik sitede güncelleme düğmesi için ayrıca veri servisi bağlantısı gerekir. Kaynak erişilemezse son sağlam paket korunur.</p></details>${data.failures?.length?`<div class="wr-notice">Yenilenemeyenler: ${data.failures.map(f=>esc(champ(f.id)?.name||f.id)).join(', ')}</div>`:''}`;
}
function handleChange(event){
  if(!active())return;const e=event.target;
  if(e.id==='wr-role'){draft.role=e.value;draft.locked=[];}
  else if(e.id==='wr-rank')draft.rank=e.value;
  else if(e.id==='wr-fed')draft.fed=e.value;
  else if(e.dataset.lock){const id=e.dataset.lock;draft.locked=e.checked?[...new Set([...draft.locked,id])]:draft.locked.filter(i=>i!==id);remember();return;}
  else return;render();
}
function handleClick(event){
  const el=event.target.closest('[data-action]');if(!el||!active())return;
  const {action,side,role,id}=el.dataset;
  if(action==='back')return window.switchView('view-dashboard');
  if(action==='pick')return openPicker({side,role,kind:'pick'});
  if(action==='bans'||action==='pool')return openPicker({kind:action});
  if(action==='refresh')return refresh();
  if(action==='tab')draft.tab=el.dataset.tab;
  if(action==='remove'){delete draft[side][role];if(side==='blue'&&role===draft.role)draft.locked=[];if(!Object.values(draft.red).includes(draft.fed))draft.fed='';}
  if(action==='choose'){draft.blue[draft.role]=id;draft.locked=[];draft.tab='build';}
  if(action==='reset'){draft=emptyDraft();}
  render();
}
function openPicker(config){
  picker=config;const dialog=root.querySelector('#wr-picker');
  dialog.innerHTML=`<header><h2 id="wr-picker-title">${config.kind==='bans'?'Yasaklanan şampiyonlar':config.kind==='pool'?'Oynadığım şampiyonlar':ROLES[config.role]+' · '+(config.side==='blue'?'Mavi takım':'Kırmızı takım')}</h2><button class="secondary" id="wr-picker-close" aria-label="Seçimi kapat">×</button></header><label>Şampiyon ara<input id="wr-search" type="search" placeholder="Şampiyon adı…" autocomplete="off"></label>${config.kind==='pick'?'<label class="wr-check"><input id="wr-role-filter" type="checkbox" checked> Yalnızca bu role uygun şampiyonlar</label>':'<p>Seçimleri açıp kapatmak için şampiyona dokun.</p>'}<div id="wr-picker-list" class="wr-picker-list"></div>`;
  dialog.querySelector('#wr-picker-close').onclick=()=>dialog.close();
  dialog.querySelector('#wr-search').oninput=()=>{clearTimeout(queryTimer);queryTimer=setTimeout(renderPicker,100);};
  dialog.querySelector('#wr-role-filter')?.addEventListener('change',renderPicker);
  dialog.addEventListener('click',pickerClick);dialog.addEventListener('close',()=>{dialog.removeEventListener('click',pickerClick);if(config.kind!=='pick')render();},{once:true});
  renderPicker();dialog.showModal();dialog.querySelector('input').focus();
}
function renderPicker(){
  if(!active()||!picker)return;
  const dialog=root.querySelector('#wr-picker'),q=dialog.querySelector('#wr-search')?.value.toLocaleLowerCase('tr-TR')||'',onlyRole=dialog.querySelector('#wr-role-filter')?.checked;
  const taken=new Set([...Object.values(draft.blue),...Object.values(draft.red)]),selected=picker.kind==='bans'?draft.bans:picker.kind==='pool'?draft.pool:[];
  const list=data.champions.filter(c=>c.name.toLocaleLowerCase('tr-TR').includes(q)&&(!onlyRole||c.roles.includes(picker.role))).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  dialog.querySelector('#wr-picker-list').innerHTML=list.map(c=>{
    const disabled=picker.kind!=='pool'&&(taken.has(c.id)||(picker.kind==='pick'&&draft.bans.includes(c.id)));
    return `<button class="wr-champion ${selected.includes(c.id)?'selected':''}" data-champion="${c.id}" ${disabled?'disabled':''} aria-pressed="${selected.includes(c.id)}">${image(c.portrait,c.name)}<b>${esc(c.name)}</b><small>${c.roles.map(r=>ROLES[r]).join(' · ')}</small></button>`;
  }).join('')||'<p>Aramana uygun şampiyon bulunamadı.</p>';
  bindImageFallback(dialog);
}
function pickerClick(event){
  const el=event.target.closest('[data-champion]');if(!el||el.disabled||!active())return;
  const id=el.dataset.champion;
  if(picker.kind==='pick'){
    draft[picker.side][picker.role]=id;if(picker.side==='blue'&&picker.role===draft.role)draft.locked=[];
    root.querySelector('#wr-picker').close();render();
  }else{const key=picker.kind;draft[key]=draft[key].includes(id)?draft[key].filter(x=>x!==id):[...draft[key],id];remember();renderPicker();}
}
async function refresh(){
  if(updating)return;updating=true;render();
  const message=text=>{const box=root?.querySelector('#wr-update-message');if(box)box.textContent=text;};
  try{
    message('Kaynaklar kontrol ediliyor. Son sağlam öneriler kullanılmaya devam ediyor.');
    let status=await api('/refresh','POST'),attempt=0;
    while(status.running&&active()&&attempt++<120){
      await new Promise(resolve=>{pollResolve=resolve;pollTimer=setTimeout(resolve,2000);});
      if(!active())return;status=await api('/status');
    }
    if(status.error)throw new Error(status.error);
    if(status.running)throw new Error('Kontrol sunucuda sürüyor. Biraz sonra yeniden kontrol edebilirsin.');
    const next=await api();if(!active())return;accept(next);render();toast('Yama, istatistik ve rehber verileri kontrol edildi.','success');
  }catch(e){if(active()){const text=errorInTurkish(e);message(text);toast(text,'error');}}
  finally{updating=false;const button=root?.querySelector('[data-action="refresh"]');if(button){button.disabled=false;button.textContent='↻ Güncel verileri kontrol et';}}
}
window.addEventListener('wr-access-revoked',()=>{controller?.abort();clearTimeout(queryTimer);clearTimeout(pollTimer);pollResolve?.();owner=null;draft=emptyDraft();picker=null;updating=false;});
