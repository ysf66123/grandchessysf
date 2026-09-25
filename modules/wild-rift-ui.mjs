import {counterSummary,counterProof,counterCoverage} from './wild-rift-counter-ui.mjs?v=20260925-counters2';
import {strategyView,adaptationView,itemFactView,advancedStrategy} from './wild-rift-build-ui.mjs?v=20260925-counters2';
import {sourcesView,priceProof} from './wild-rift-source-ui.mjs?v=20260925-counters2';
import {staticMode,publishedSnapshot} from './wild-rift-static.mjs?v=20260925-counters2';
import {itemAvailability,priceEvidence,finalItemAvailable,finalBuildAvailable} from './wild-rift-evidence.mjs?v=20260925-counters2';
import {emptyDraft,sanitizeDraft,recommendations,recommendBuild,coaching,matchupPlan,threats,freshness,laneScenarios,movePick,SORT_MODES,ROLES} from './wild-rift-engine.mjs?v=20260925-counters2';
import {dataQuality,championBuilds,guideQuality} from './wild-rift-quality.mjs?v=20260925-counters2';
import {createHistory,readWorkspace,writeWorkspace} from './wild-rift-workspace.mjs?v=20260925-counters2';
import {purchasePlan,itemCost} from './wild-rift-purchase.mjs?v=20260925-counters2';
import {RANKS,traits,BOOT_UPGRADES} from './wild-rift-knowledge.mjs?v=20260925-counters2';
import {itemName,termName} from './wild-rift-tr.mjs?v=20260925-counters2';
let data=null,draft=emptyDraft(),root=null,picker=null,queryTimer=null,controller=null,updating=false,pollTimer=null,pollResolve=null,owner=null;
const history=createHistory();
let lastBuildDecision=null,decisionNotice='';
let workspace={saved:[],feedback:[]},showAll=false,renderTimes=[],feedbackId='',serviceStatus=null,proofItem='';
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
function image(url,name){if(!url)return `<span class="wr-image-fallback">${esc(name.slice(0,2).toLocaleUpperCase('tr-TR'))}</span>`;return `<img src="${esc(safeUrl(url))}" alt="${esc(name)}" loading="lazy" decoding="async" width="44" height="44" referrerpolicy="no-referrer">`;}
function bindImageFallback(scope){scope.querySelectorAll('img').forEach(img=>{img.onerror=()=>{const fallback=document.createElement('span');fallback.className='wr-image-fallback';fallback.textContent=img.alt.slice(0,2).toLocaleUpperCase('tr-TR');fallback.setAttribute('aria-hidden','true');img.replaceWith(fallback);};});}
let lastSaved='';
function remember(){const value=JSON.stringify(draft);if(value===lastSaved)return;try{localStorage.setItem('gm_wr_draft_'+owner,value);lastSaved=value;}catch{} }
function saveWorkspace(){if(!writeWorkspace(localStorage,owner,workspace))toast('Cihaz depolaması dolu veya kapalı; değişiklik bu oturumda tutuluyor.','error');}
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
  if(!document.getElementById('wr-css')){const link=document.createElement('link');link.id='wr-css';link.rel='stylesheet';link.href=new URL('../wild-rift.css?v=20260925-counters2',import.meta.url).href;document.head.append(link);}
  root.innerHTML='<div class="wr-empty" role="status">Wild Rift verileri hazırlanıyor…</div>';
  if(!data){
    try{accept(await (staticMode()?publishedSnapshot(controller.signal):api()));}
    catch(e){
      if(!active())return;
      try{const response=await fetch(new URL('../data/wild-rift.json',import.meta.url),{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw Error();accept(await response.json());}
      catch{root.innerHTML='<div class="wr-empty">Veriler yüklenemedi. Bağlantını kontrol edip paneli yeniden aç.</div>';return;}
    }
  }
  if(!active())return;
  try{draft=sanitizeDraft(JSON.parse(localStorage.getItem('gm_wr_draft_'+owner)),data);}catch{draft=emptyDraft();}
  workspace=readWorkspace(localStorage,owner);history.reset(draft);lastSaved='';showAll=false;
  root.onclick=handleClick;root.onchange=handleChange;render();
  if(!staticMode()&&!serviceStatus)api('/status').then(status=>{if(active())serviceStatus=status;}).catch(()=>{});
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
    const c=champ(draft[side][role]);return `<div class="wr-slot-wrap"><div class="wr-slot ${side==='blue'&&role===draft.role?'wr-mine':''}"><button class="wr-slot-pick" data-action="pick" data-side="${side}" data-role="${role}">${c?image(c.portrait,c.name):'<span class="wr-placeholder">＋</span>'}<span><small>${name}${side==='blue'&&role===draft.role?' · SEN':''}</small><b>${esc(c?.name||'Seçim bekleniyor')}</b>${c&&!c.roles.includes(role)?'<small class="wr-warning">Alışılmış rol dışında · veri sınırlı</small>':''}</span></button>${c?`<button class="wr-clear" data-action="move" data-side="${side}" data-role="${role}" aria-label="${esc(c.name)} koridorunu değiştir">⇄</button><button class="wr-clear" data-action="remove" data-side="${side}" data-role="${role}" aria-label="${name} seçimini kaldır">×</button>`:''}</div>${side==='red'&&c&&c.roles.length>1?`<label class="wr-check wr-flex"><input type="checkbox" data-uncertain="${c.id}" ${draft.uncertain.includes(c.id)?'checked':''}> Koridoru henüz belli değil</label>`:''}</div>`;
  }).join('')}</section>`;
}
function render(){
  if(!active()||!root)return;
  const started=performance.now();history.record(draft);
  const tabs={counters:'Karşı seçimler',build:'Eşya dizilimi',coach:'Oyun planı',team:'Takım dengesi',patch:'Yama ve kaynaklar'};
  root.innerHTML=header()+`<div class="wr-teams">${team('blue')}${team('red')}</div><div class="wr-tools"><button class="secondary" data-action="bans">Yasaklar (${draft.bans.length})</button><button class="secondary" data-action="pool">Şampiyon havuzum (${draft.pool.length||'Tümü'})</button><button class="secondary" data-action="undo" ${history.canUndo?'':'disabled'} aria-label="Son değişikliği geri al">↶ Geri al</button><button class="secondary" data-action="redo" ${history.canRedo?'':'disabled'}>↷ İleri al</button><button class="secondary" data-action="saved">Kayıtlı seçimler (${workspace.saved.length})</button><button class="secondary" data-action="reset">Seçimleri temizle</button><span>Seçimler bu hesap için bu cihazda saklanır.</span></div><nav class="wr-tabs" aria-label="Wild Rift bölümleri">${Object.entries(tabs).map(([id,n])=>`<button data-action="tab" data-tab="${id}" aria-current="${draft.tab===id?'page':'false'}">${n}</button>`).join('')}</nav><div class="wr-content">${draft.tab==='counters'?counterView():draft.tab==='build'?buildView():draft.tab==='coach'?coachView():draft.tab==='team'?teamView():patchView()}</div><footer class="wr-foot">Öneriler istatistik, rehber eşleşmeleri ve açıklanabilir kurallara dayanır. Uygunluk sırası kazanma olasılığı değildir.</footer><dialog id="wr-picker" class="wr-dialog" aria-labelledby="wr-picker-title"></dialog>`;
  bindImageFallback(root);
  remember();
  renderTimes.push(performance.now()-started);renderTimes=renderTimes.slice(-100);
}
function counterView(){
  const all=recommendations(data,draft),list=all.slice(0,showAll?all.length:3),scenarios=laneScenarios(data,draft);
  const opponents=scenarios.opponents.map(c=>c?.name||'Henüz seçilmemiş rakip').join(' / ');
  const labels={supported:'Rehberle destekli',limited:'Sınırlı eşleşme kanıtı',low:'Güncellik zayıf'};
  return `<div class="wr-section-head"><div><h2>${ROLES[draft.role]} için öneriler</h2><p>${scenarios.uncertain?'Olası koridor rakipleri: '+esc(opponents)+'. En zor desteklenmiş senaryo esas alınıyor.':scenarios.opponents[0]?esc(opponents)+' eşleşmesi ve rakip takım birlikte değerlendiriliyor.':'Rakibin koridorunu belirleyerek eşleşme değerlendirmesini güçlendir.'}</p></div><span class="wr-pill">${Object.values(draft.red).length}/5 rakip belli</span></div>
    ${counterCoverage(data)}
    ${data.counterSources?.retryAfter&&Date.parse(data.counterSources.retryAfter)>Date.now()?'<p class="wr-muted">Ek karşı seçim kaynağı bekleme süresinde; son doğrulanmış kayıtlar kendi tarihleriyle kullanılıyor.</p>':''}
    ${!scenarios.valid?'<div class="wr-notice">Olası koridorlar çakışıyor. Rakip yerleşimlerini düzelt; eşleşme bonusları şimdilik kapalı.</div>':''}
    <div class="wr-choice-controls"><label>Önceliğim<select id="wr-sort">${Object.entries(SORT_MODES).map(([id,name])=>`<option value="${id}" ${id===draft.sort?'selected':''}>${name}</option>`).join('')}</select></label><p class="wr-muted">İlk üç aday gösteriliyor. Şampiyon tecrübeni belirtebilir, üç adaya kadar karşılaştırabilirsin.</p></div>
    <p class="wr-muted">${all.length} uygun adayın ${all.filter(r=>r.matchups.some(m=>m.known)).length} tanesi için doğrudan eşleşme kaydı var. Veri bulunmaması, eşleşmenin dengeli olduğu anlamına gelmez.</p>${comparisonView(all)}<div class="wr-recommendations">${list.map((r,i)=>`<article class="wr-rec"><div class="wr-rec-head"><span class="wr-rank">${i+1}</span>${image(r.champion.portrait,r.champion.name)}<div><h3>${esc(r.champion.name)}</h3><small>${esc(r.evidence)}</small></div><span class="wr-tier">${esc(r.tier||'?')}<small>META</small></span></div><span class="wr-evidence ${r.confidence}">${labels[r.confidence]}</span>${counterSummary(r)}<ul>${r.reasons.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${r.risks.length?`<p class="wr-risk">${r.risks.map(esc).join(' ')}</p>`:''}
    <details class="wr-details"><summary>Kararın dayanağı</summary><p>${esc(r.quality.label)}. Kaynak kontrolü: ${date(r.champion.fetchedAt)}.</p><p>Meta: ${r.parts.meta} · Genel istatistik: ${r.parts.statistics.toFixed(1)} · Eşleşme: ${r.parts.lane} · Mekanik: ${r.parts.mechanics} · İkiye iki: ${r.parts.duo} · Takım: ${r.parts.team} · Tecrübe: ${r.parts.comfort} · Risk düzeltmesi: ${r.parts.safety}</p><p>Bu değerler sıralama katkılarıdır; kazanma yüzdesi veya istatistiksel güven aralığı değildir. Seçtiğin öncelik katkıların ağırlığını değiştirir.</p>${counterProof(r)}</details>
    <label class="wr-experience">Bu şampiyondaki tecrübem<select data-comfort="${r.champion.id}"><option value="0">Belirtilmedi / yeni öğreniyorum</option><option value="1" ${draft.comfort[r.champion.id]===1?'selected':''}>Rahat oynarım</option><option value="2" ${draft.comfort[r.champion.id]===2?'selected':''}>Çok tecrübeliyim</option></select></label>
    <div class="wr-rec-actions"><label class="wr-check"><input type="checkbox" data-compare="${r.champion.id}" ${draft.compare.includes(r.champion.id)?'checked':''}> Karşılaştır</label><button class="secondary" data-action="feedback" data-id="${r.champion.id}">Öneriyi değerlendir</button></div>
    <div class="wr-rec-bottom"><span>${r.stat?`${r.statsCurrent?'Genel kazanma':'Eski genel oran'}: %${r.stat.win.toFixed(2).replace('.',',')}<small>${esc(data.stats.asOf)} · Çin sunucusu<br>Bu rakibe özel oran değildir.</small>`:'Bu lig/rol için istatistik yok.'}</span><button data-action="choose" data-id="${r.champion.id}">Şampiyonumu seç</button></div></article>`).join('')||'<div class="wr-empty">Bu rol ve havuz için kullanılabilir şampiyon kalmadı. Yasakları veya havuzunu düzenle.</div>'}</div>
    ${all.length>3?`<button class="secondary wr-more" data-action="more">${showAll?'İlk üç adayı göster':`Diğer ${all.length-3} adayı göster`}</button>`:''}`;
}
function comparisonView(all){
  const compared=all.filter(r=>draft.compare.includes(r.champion.id));if(!compared.length)return '';
  return `<section class="wr-comparison"><h3>Aday karşılaştırması</h3><div class="wr-table-scroll"><table><caption>Seçilen öncelik: ${SORT_MODES[draft.sort]}. Büyük katkı daha olumlu değerlendirmeyi gösterir.</caption><thead><tr><th>Şampiyon</th><th>Meta</th><th>Eşleşme katkısı</th><th>Takım katkısı</th><th>Tecrüben</th></tr></thead><tbody>${compared.map(r=>`<tr><th>${esc(r.champion.name)}</th><td>${esc(r.tier)}</td><td>${r.laneRange[0]===r.laneRange[1]?r.parts.lane:r.laneRange.join(' … ')}</td><td>${r.parts.team}</td><td>${['Belirtilmedi','Rahat','Çok tecrübeli'][draft.comfort[r.champion.id]||0]}</td></tr>`).join('')}</tbody></table></div><button class="secondary" data-action="clear-compare">Karşılaştırmayı temizle</button></section>`;
}
function itemCard(id,index,change){
  const item=data.items[id];return `<div class="wr-item">${image(item?.icon,itemName(id))}<div><small>${index+1}. YUVA</small><b>${esc(itemName(id))}</b><p>${esc(change?.label||'Şampiyonun kaynak rehberindeki temel tercih.')}</p>${BOOT_UPGRADES[id]?`<p>10. dakikadan sonra: <b>${BOOT_UPGRADES[id]}</b> · aynı yuva</p>`:''}${itemFactView(data,id)}<label class="wr-check"><input type="checkbox" data-lock="${id}" ${draft.locked.includes(id)?'checked':''}> Satın aldım, koru</label></div></div>`;
}
function buildView(){
  const result=recommendBuild(data,draft);
  if(!result.champion)return '<div class="wr-empty">Tam eşya dizilimini görmek için mavi takımdan kontrol ettiğin şampiyonu seç.</div>';
  if(result.missing&&result.inventoryConflict)return `<div class="wr-notice">Satın aldığın ${result.inventoryConflict.map(id=>esc(itemName(id))).join(', ')} seçili kaynak dizilimine güvenle yerleştirilemiyor. Bu eşyayı yok sayarak yeni alışveriş önermiyoruz.<button class="secondary" data-action="clear-inventory">Satın alma kayıtlarını temizle</button></div>`;
    if(result.missing&&result.invalidItems)return `<div class="wr-empty">Kaynak diziliminde kaldırılmış veya güncel Wild Rift kataloğunda doğrulanamayan eşya var: ${result.invalidItems.map(id=>esc(itemName(id))).join(', ')}. Bu dizilim önerilmiyor.</div>`;
  if(result.missing)return '<div class="wr-empty">Bu şampiyonun seçili rolü için doğrulanmış dizilim yok. Rolünü kontrol et veya kaynaklar güncellenince yeniden dene.</div>';
  const decisionKey=String(owner)+':'+result.champion.id+':'+result.base.guideId;
  if(lastBuildDecision?.key!==decisionKey)decisionNotice='';
  else if(lastBuildDecision.final.join()!==result.final.join()){
    const removed=lastBuildDecision.final.filter(id=>!result.final.includes(id)),added=result.final.filter(id=>!lastBuildDecision.final.includes(id));
    decisionNotice='Öneri güncellendi: '+removed.map(itemName).join(', ')+' yerine '+added.map(itemName).join(', ')+'. '+(result.changes.map(c=>c.label).join(' · ')||'Yeni bilgilerle kaynak dizilimine dönüldü.');
  }
  lastBuildDecision={key:decisionKey,final:[...result.final]};
  const {base,final,changes,alternatives}=result,variants=championBuilds(result.champion).filter(b=>b.role===draft.role&&finalBuildAvailable(data,b.final)&&guideQuality(data,result.champion,b.role,Date.now(),b.guideId).usable);
  return `<div class="wr-section-head"><div><h2>${esc(result.champion.name)} · Maça özel dizilim</h2><p>İlk iki ana eşya korunur; uygun alternatifler rakibin tehditlerine göre değerlendirilir.</p></div><a href="${safeUrl(base.source)}" target="_blank" rel="noopener noreferrer">Kaynak rehber ↗</a></div>${!result.current?'<div class="wr-notice">Bu rehber güncel yamayla doğrulanmadı. Son bilinen dizilim gösteriliyor; otomatik eşya değişiklikleri durduruldu.</div>':''}
    <label class="wr-fed">Rakipte kim önde?<select id="wr-fed"><option value="">Belli değil / seçim aşamasındayım</option>${Object.values(draft.red).map(id=>`<option value="${id}" ${draft.fed===id?'selected':''}>${esc(champ(id)?.name)}</option>`).join('')}</select></label>
    ${decisionNotice?`<p class="wr-decision-change" role="status">${esc(decisionNotice)}</p>`:''}${strategyView(result,draft)}${advancedStrategy(data,result,draft)}
    ${enemyGearView()}
    ${variants.length>1?`<label class="wr-fed">Bu rol için kaynak dizilimi<select id="wr-variant">${variants.map((b,i)=>`<option value="${esc(b.guideId)}" ${base.guideId===b.guideId?'selected':''}>${b.sourceId==='wildriftcore'?'WildRiftCore · Çin · '+esc(b.label):'WildRiftFire · Dizilim '+(i+1)} · ${b.core.slice(0,2).map(id=>esc(itemName(id))).join(' + ')}</option>`).join('')}</select></label><p class="wr-muted">Kaynak bu rol için birden fazla dizilim veriyor. Değiştirirken mevcut satın alma işaretleri temizlenir; seçimin şampiyon biçimine uygunluğunu kaynak rehberden kontrol et.</p>`:''}
    ${result.sourceFallback?'<p class="wr-notice">Ana rehberde doğrulanamayan eşya bulunduğu için geçerli bir tam kaynak dizilimi gösteriliyor.</p>':''}${base.region==='CN'?'<p class="wr-notice">Bu tam dizilim WildRiftCore Çin sunucusu kaynağıdır; bölgesel yama zamanlaması farklı olabilir. Eşyalar ayrıca güncel Wild Rift kataloğuyla doğrulanır.</p>':''}${result.quality.normalized?`<div class="wr-notice">${esc(result.quality.issues.find(i=>i.startsWith('Kaynak yedi')))}</div>`:''}
    ${result.rejected.length?`<div class="wr-notice">${[...new Set(result.rejected)].map(esc).join(' ')}</div>`:''}
    <div class="wr-purchase"><b>Başlangıç</b><span>${base.starting.map(id=>esc(itemName(id))).join(' + ')}</span><b>İlk dönüş</b><span>${esc(itemName(base.core[0]||base.final[0]))} için parça biriktir; koridor baskısına göre botu öne al.</span></div>
    ${purchaseView(result)}
    <div class="wr-build">${final.map((id,i)=>itemCard(id,i,changes.find(c=>c.to===id))).join('')}</div>
    ${adaptationView(result)}
    <div class="wr-detail-grid"><section><h3>Rünler</h3>${base.runeSource?'<p class="wr-muted">Rünler ve yetenek sırası ana WildRiftFire rehberindendir.</p>':''}<div class="wr-chips">${base.runes.map(r=>`<span>${esc(termName(r))}</span>`).join('')}</div><h3>Sihirdar büyüleri</h3><div class="wr-chips">${base.spells.map(r=>`<span>${esc(termName(r))}</span>`).join('')}</div></section><section><h3>Yetenek sırası · seviye 1–15</h3><div class="wr-skills">${base.skillOrder.map((r,i)=>`<span title="${i+1}. seviye"><small>${i+1}</small>${r===4?'U':r||'?'}</span>`).join('')}</div><p class="wr-muted">1, 2, 3: temel yetenekler · U: ulti</p></section></div>
    <details class="wr-details"><summary>Duruma bağlı alternatifler (${alternatives.length})</summary><p>Kaynak alternatifini elle seçebilirsin. İlk iki ana eşya, satın aldıkların ve çakışan eşya etkileri korunur.</p>${[...new Set(alternatives.map(a=>a.from))].map(from=>`<label class="wr-alternative">${esc(itemName(from))} yerine<select data-alternative="${from}" ${!result.current?'disabled':''}><option value="">Otomatik karar</option>${alternatives.filter(a=>a.from===from).map(a=>`<option value="${a.to}" ${draft.overrides[from]===a.to?'selected':''}>${esc(itemName(a.to))} · ${esc(a.label)}</option>`).join('')}</select></label>`).join('')||'<p>Kaynakta bu rol için ek alternatif belirtilmemiş.</p>'}</details><p class="wr-muted">Rehber yaması: ${esc(base.patch)} · Alınma zamanı: ${date(base.fetchedAt||result.champion.fetchedAt)}</p>`;
}
function purchaseView(result){
  const plan=purchasePlan(data,draft,result),next=plan.next;
  return `<details class="wr-details" open><summary>Alışveriş planı</summary><div class="wr-purchase-controls"><label>Şu anki altınım<input id="wr-gold" type="number" min="0" max="30000" step="1" value="${draft.gold}" inputmode="numeric"></label><label>Elimdeki parça / diğer eşya<select id="wr-owned-item"><option value="">Eşya seç</option>${Object.keys(data.items).filter(id=>itemAvailability(data,id)).sort((a,b)=>itemName(a).localeCompare(itemName(b),'tr')).map(id=>`<option value="${id}">${esc(itemName(id))}</option>`).join('')}</select></label><button class="secondary" data-action="add-owned">Ekle</button></div><div class="wr-chips">${draft.owned.map((id,i)=>`<button class="secondary" data-action="remove-owned" data-index="${i}" aria-label="${esc(itemName(id))} parçasını kaldır">${esc(itemName(id))} ×</button>`).join('')}</div><p class="wr-muted">Tamamladığın dizilim eşyalarını aşağıda “Satın aldım, koru” ile işaretle.</p><p>${esc(plan.message)}</p>
    <p class="wr-muted">${esc(plan.orderReason)}</p>${plan.transformations.map(t=>`<p class="wr-muted">${esc(itemName(t.from))} → ${esc(itemName(t.to))}: ${t.owned?'Ana eşya alınmış; oyun içi birikim/dönüşüm koşulunu tamamla.':'Mağazadan ana eşya alınır; dönüşmüş biçim ayrıca satın alınmaz.'}</p>`).join('')}<label class="wr-fed">Alışveriş hedefimi seç<select id="wr-purchase-target"><option value="">Önerilen sıra</option>${plan.rows.map(r=>`<option value="${r.finalId||r.id}" ${draft.purchaseTarget===(r.finalId||r.id)?'selected':''}>${esc(itemName(r.id))}</option>`).join('')}</select></label>${plan.starters.length?`<p><b>Kaynak başlangıç seçenekleri:</b> ${plan.starters.map(i=>esc(itemName(i.id))+' · '+i.cost+' altın').join(' / ')} · Önceden aldıysan parçalarına ekle.</p>`:''}${next&&!next.room?'<p class="wr-risk">Envanterde boş yuva yok. Uygun parçaları birleştirmeden yeni eşya alma.</p>':''}${next?`<p><b>Sıradaki alışveriş hedefi: ${esc(itemName(next.id))}</b> · ${next.cost===null?'Güncel fiyat doğrulanamadı.':`${(next.exact?next.completion:next.cost).toLocaleString('tr-TR')} altın${next.exact?' · Tamamlama bedeli':' · Liste fiyatı'}${!next.room?' · Boş yuva gerekli.':plan.exactCompletion?next.affordable?' · Altının yeterli.':` · ${Math.max(0,next.completion-draft.gold).toLocaleString('tr-TR')} altın eksik.`:' · Parçalara göre tamamlama bedelini oyun mağazasında kontrol et.'}`}</p>`:'<p>Dizilimdeki tüm eşyaları satın alınmış olarak işaretledin.</p>'}
    ${next?`<details class="wr-details"><summary>Fiyatın kaynağı</summary>${priceProof(data,next.id)}</details>`:''}${plan.components.length?`<div class="wr-component-options"><h3>Bu altınla alınabilecek tarif parçaları</h3><p class="wr-muted">Bunlar birbirinin alternatifidir; hepsini birden almanı önermez.</p>${plan.components.map(c=>`<p><b>${esc(itemName(c.id))}</b> · ${c.cost} altın</p>`).join('')}</div>`:''}
    ${plan.early.length?`<aside class="wr-early-buy"><h3>Koridorda erken karşı parça</h3>${plan.early.map(e=>`<p><b>${esc(itemName(e.id))} · ${e.cost} altın</b> · ${e.targets.map(esc).join(', ')} karşısında iyileşmeyi azaltmak için düşünülebilir.</p><p>Son dizilimdeki ${esc(itemName(e.target))} tarifine gider. ${e.affordable?'Şu anki altının yeterli.':'Önce '+Math.max(0,e.cost-draft.gold)+' altın daha gerekiyor.'} Ana eşyaya ayıracağın ${e.delay} altını bu parçaya yönlendirmiş olursun; gereksiz yere güçlenme zamanını geciktirme.</p>`).join('')}</aside>`:''}
    <ol class="wr-shopping-list">${plan.rows.map(row=>`<li>${esc(itemName(row.id))}<span>${row.cost===null?'Fiyat doğrulanmadı':row.cost.toLocaleString('tr-TR')+' altın'}</span></li>`).join('')}</ol>${plan.total!==null?`<p class="wr-muted">Kalan tam eşyaların toplam liste bedeli: ${plan.total.toLocaleString('tr-TR')} altın. ${plan.hasComponents?'Elindeki parçalar bu toplamdan düşülmedi.':''}</p>`:''}</details>`;
}
function enemyGearView(){
  const enemies=Object.values(draft.red);if(!enemies.length)return '';
  return `<details class="wr-details"><summary>Rakibin aldığı eşyalar</summary><p>Gördüğün eşyaları elle ekle. Güncel eşya bilgileri; kritik, zırh, büyü direnci, saldırı/büyü gücü, can çalma ve kalkan sinyallerine katılır. Kritik karşıtı eşya önerisi normal saldırı etiketiyle tek başına tetiklenmez.</p><div class="wr-purchase-controls"><label>Rakip<select id="wr-enemy-target">${enemies.map(id=>`<option value="${id}">${esc(champ(id)?.name)}</option>`).join('')}</select></label><label>Aldığı eşya<select id="wr-enemy-item">${Object.keys(data.items).filter(id=>itemAvailability(data,id)).sort((a,b)=>itemName(a).localeCompare(itemName(b),'tr')).map(id=>`<option value="${id}">${esc(itemName(id))}${itemCost(data,id)===null?' · Güncel değer yok':''}</option>`).join('')}</select></label><button class="secondary" data-action="add-enemy-item">Eşyayı ekle</button></div>${enemies.filter(id=>draft.enemyItems[id]?.length).map(id=>`<div class="wr-enemy-gear"><b>${esc(champ(id)?.name)}</b><div class="wr-chips">${draft.enemyItems[id].map(item=>`<button class="secondary" data-action="remove-enemy-item" data-id="${id}" data-item="${item}">${esc(itemName(item))} ×</button>`).join('')}</div></div>`).join('')}${enemies.map(id=>`<label class="wr-enemy-level">${esc(champ(id)?.name)} · seviye (isteğe bağlı)<input type="number" min="1" max="15" data-enemy-level="${id}" value="${draft.enemyLevels[id]||''}" placeholder="Bilinmiyor"></label>`).join('')}<p class="wr-muted">Seviye girildiğinde kaynakta doğrulanan doğal dirençler de hesaba katılır. Girilmeyen eşyalar ve oyundaki geçici etkiler bilinmiyor; toplam hasar veya gerçek direnç değeri hesaplanmıyor.</p></details>`;
}
function coachView(){const tips=coaching(data,draft),sections=matchupPlan(data,draft);return `<h2>Koridordan takım savaşına oyun planı</h2>${sections.map(section=>`<section class="wr-matchup-section"><h3>${esc(section.title)}</h3><p class="wr-muted">${esc(section.basis)}</p><ul>${section.lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul></section>`).join('')}${tips.length?`<div class="wr-coach">${tips.map((tip,i)=>`<article><span>${i+1}</span><p>${esc(tip)}</p></article>`).join('')}</div><p class="wr-muted">Bunlar eşleşme özelliklerine dayanan oyun ilkeleridir. Rakibin anlık yetenek bekleme süreleri veya altını otomatik okunmaz.</p>`:'<div class="wr-empty">Önce kendi şampiyonunu seç.</div>'}`;}
function teamView(){
  const t=threats(data,draft),labels={physical:'Fiziksel hasar',magic:'Büyü hasarı',mixed:'Karma hasar',heal:'İyileşme',shield:'Kalkan',tank:'Dayanıklılık',cc:'Kontrol etkisi',burst:'Ani hasar',poke:'Menzilli baskı',attack:'Normal saldırı',engage:'Savaşı başlatma',critical:'Kritik eşya yatırımı',armor:'Zırh eşyası',magicResist:'Büyü direnci eşyası'};
  const allies=Object.values(draft.blue).map(champ).filter(Boolean),missing=[];
  if(allies.length&&!allies.some(c=>traits(c).tank))missing.push('Seçili mavi takımda belirgin bir ön saf tankı yok.');
  if(allies.length&&!allies.some(c=>traits(c).engage))missing.push('Savaşı başlatma araçları sınırlı; görüş ve yakalama fırsatları önemli.');
  if(allies.length>1&&allies.every(c=>traits(c).damage==='physical'))missing.push('Hasar fiziksel ağırlıklı; rakibin zırh yatırımı değer kazanabilir.');
  return `<h2>Rakibin tehdit haritası</h2><p class="wr-muted">Koridor rakibi ve önde seçilen rakip daha fazla ağırlık taşır. Bu grafik gerçek hasar ölçümü değildir.</p><div class="wr-threats">${Object.entries(t).map(([k,v])=>`<div><span>${labels[k]}</span><meter min="0" max="7" value="${v}" aria-label="${labels[k]}"></meter><small>${v===0?'Belirgin değil':v>=3?'Yüksek':'Mevcut'}</small></div>`).join('')}</div><h3>Mavi takımın ihtiyaçları</h3>${missing.map(x=>`<p>${x}</p>`).join('')||'<p>Şu anki seçimlerde belirgin bir eksik saptanmadı.</p>'}<p class="wr-muted">${5-allies.length} mavi takım yuvası ve ${5-Object.values(draft.red).length} rakip yuvası henüz boş. Boş yuvalar biliniyormuş gibi hesaba katılmaz.</p>`;
}
function qualityView(){
  const q=dataQuality(data),times=[...renderTimes].sort((a,b)=>a-b),p95=times.length?times[Math.min(times.length-1,Math.floor(times.length*.95))].toFixed(1):'—';
  const prices=Object.keys(data.items).filter(id=>itemCost(data,id)!==null).length;
  const resources=performance.getEntriesByType('resource').filter(r=>r.name.includes('wild-rift')||r.name.includes('/api/wild-rift'));
  return `<section class="wr-quality"><h2>Önerilerin veri dayanağı</h2><div class="wr-metrics"><div><b>${q.current}/${q.total}</b><span>Yama ve tarih uyumlu rol rehberi</span></div><div><b>${q.limited}</b><span>Yedi eşya kaynak tutarsızlığı</span></div><div><b>${prices}</b><span>Fiyatı güncel eşya</span></div></div><p class="wr-muted">Resmî yama, topluluk rehberleri ve tarihli istatistikler birlikte kontrol edilir. Kaynak karşılaştırması aşağıdadır; aynı maç verisinin iki sitede bulunması bağımsız iki kaynak doğrulaması sayılmaz. Örneklem sayısı olmadığı için istatistiksel güven yüzdesi hesaplanmaz.</p><details class="wr-details"><summary>Güncelleme takibi</summary><p>${staticMode()?'Bilgisayardaki güncelleyici altı saatte bir tarar ve veriyi GitHub’a gönderir. Son yayımlanan kontrol: '+date(data.evidence?.checkedAt||data.checkedAt):serviceStatus?serviceStatus.running?'Sunucuda kontrol sürüyor.':serviceStatus.error?esc(serviceStatus.error):'Son sorguda çalışan güncelleme yok.':'Sunucu durumu alınamadı veya henüz bağlı değil.'}</p>${serviceStatus?.sync?.message?`<p>GitHub aktarımı: ${esc(serviceStatus.sync.message)}</p>`:''}${serviceStatus?.lastSuccessAt?`<p>Son başarılı sunucu kontrolü: ${date(serviceStatus.lastSuccessAt)}</p>`:''}${(serviceStatus?.events||[]).map(e=>`<p>${date(e.at)} · ${e.ok?'Tamamlandı':'Başarısız; önceki veri korundu'}${e.patch?' · '+esc(e.patch):''}</p>`).join('')}<p>Yeni yamanın bulunması, bütün rehberlerin o yamaya uyarlanmış olduğu anlamına gelmez.</p></details><details class="wr-details"><summary>Bu cihazdaki performans ölçümü</summary><p>Son ${times.length} ekran çizimi · %95 çizim süresi: ${p95} ms. Bu süre JavaScript ile ekran hazırlamayı ölçer; toplam açılış veya kullanıcıya yanıt süresi değildir.</p><p>Modla ilişkili kaynak isteği: ${resources.length} · Tarayıcının bildirdiği aktarım: ${Math.round(resources.reduce((n,r)=>n+(r.transferSize||0),0)/1024)} KB. Önbellek ve başka kökenlerdeki ölçüm kısıtları nedeniyle aktarım eksik görünebilir.</p><p>Ölçümler yalnızca bu cihazda bu oturum için tutulur; dışarı gönderilmez.</p></details></section>`;
}
function patchView(){
  const builds=data.champions.flatMap(c=>c.builds||[]),current=builds.filter(b=>b.patch===data.latestPatch.version).length;
  return qualityView()+sourcesView(data,draft,proofItem)+`<h2>Veri durumu ve kaynaklar</h2><div class="wr-metrics"><div><b>${data.champions.length}</b><span>Şampiyon</span></div><div><b>${current}/${builds.length}</b><span>Yamayla eşleşen rol rehberi</span></div><div><b>${Object.keys(data.items).length}</b><span>Eşya ve tarif parçası</span></div></div><dl class="wr-source-list"><dt>Son resmî yama</dt><dd><a target="_blank" rel="noopener noreferrer" href="${safeUrl(data.latestPatch.url)}">${esc(data.latestPatch.version)} · Türkçe yama notları ↗</a></dd><dt>Resmî yayım zamanı</dt><dd>${date(data.latestPatch.publishedAt)}</dd><dt>Son başarılı kontrol</dt><dd>${date(data.checkedAt)}</dd><dt>İstatistik sürümü</dt><dd>${esc(data.stats.patch)} · ${esc(data.stats.asOf)}</dd><dt>İstatistik kapsamı</dt><dd>Çin sunucusu · ${RANKS[draft.rank]} · Örneklem sayısı kaynakta belirtilmiyor.</dd><dt>İstatistik ve rehber sağlayıcısı</dt><dd><a href="https://www.wildriftfire.com/stats" target="_blank" rel="noopener noreferrer">WildRiftFire ↗</a></dd><dt>Son kontrolde değişen rehber</dt><dd>${data.changes?.length||0}</dd><dt>Yenilenemeyen rehber</dt><dd>${data.failures?.length||0}</dd></dl><details class="wr-details"><summary>Sıralama nasıl çalışıyor?</summary><p>Rolün meta seviyesi temel alınır. Güncel genel kazanma oranının etkisi sınırlıdır. Kaynak rehberde belirtilmiş karşı seçimler ve takım uyumu değerlendirmeyi değiştirir. Doğrudan eşleşme kazanma oranı kullanılmaz.</p><p>Bir rehberdeki yama etiketi bağımsız bir performans garantisi değildir. Eşyalar şampiyona ve role özel kaynak diziliminden seçilir; açıklanabilir durum kurallarıyla sınırlı değişiklik yapılır. Oyun istemcisiyle çelişen bilgi yeniden doğrulanmalıdır.</p><p>Kaynak taraması bilgisayardaki güncelleyici açıkken altı saatte bir yapılır. Doğrulanan veri otomatik GitHub’a gönderilir; Pages yayını tamamlanınca sitede görünür. Bu düğme yayımlanan son paketi alır. Bilgisayar kapalıyken site son yayımlanan verilerle çalışır.</p></details>${data.failures?.length?`<div class="wr-notice">Yenilenemeyenler: ${data.failures.map(f=>esc(champ(f.id)?.name||f.id)).join(', ')}</div>`:''}`;
}
function handleChange(event){
  if(!active())return;const e=event.target;
  if(e.id==='wr-role'){draft.role=e.value;draft.locked=[];draft.overrides={};draft.owned=[];draft.compare=[];}
  else if(e.id==='wr-variant'){draft.variant=e.value;draft.locked=[];draft.overrides={};draft.owned=[];}
  else if(e.id==='wr-rank')draft.rank=e.value;
  else if(e.id==='wr-sort')draft.sort=e.value;
  else if(e.id==='wr-fed')draft.fed=e.value;
  else if(e.id==='wr-phase')draft.phase=e.value;
  else if(e.id==='wr-own-state')draft.ownState=e.value;
  else if(e.id==='wr-adaptation')draft.adaptation=e.value;
  else if(e.id==='wr-purchase-target')draft.purchaseTarget=e.value;
  else if(e.dataset.enemyLevel){const n=Number(e.value);if(Number.isInteger(n)&&n>=1&&n<=15)draft.enemyLevels[e.dataset.enemyLevel]=n;else delete draft.enemyLevels[e.dataset.enemyLevel];}
  else if(e.id==='wr-build-priority')draft.buildPriority=e.value;
  else if(e.dataset.teamCoverage)draft.teamCoverage[e.dataset.teamCoverage]=e.checked;
  else if(e.id==='wr-proof-item'){proofItem=e.value;render();root.querySelector('#wr-proof-item')?.closest('details')?.setAttribute('open','');return;}
  else if(e.id==='wr-gold')draft.gold=Math.max(0,Math.min(30000,Math.floor(Number(e.value)||0)));
  else if(e.dataset.uncertain){const id=e.dataset.uncertain;draft.uncertain=e.checked?[...new Set([...draft.uncertain,id])]:draft.uncertain.filter(i=>i!==id);}
  else if(e.dataset.comfort)draft.comfort[e.dataset.comfort]=Number(e.value);
  else if(e.dataset.compare){
    const id=e.dataset.compare;
    if(e.checked&&draft.compare.length>=3){e.checked=false;toast('En fazla üç adayı karşılaştırabilirsin.');return;}
    draft.compare=e.checked?[...draft.compare,id]:draft.compare.filter(i=>i!==id);
  }
  else if(e.dataset.alternative){if(e.value)draft.overrides[e.dataset.alternative]=e.value;else delete draft.overrides[e.dataset.alternative];}
  else if(e.dataset.lock){const id=e.dataset.lock;draft.locked=e.checked?[...new Set([...draft.locked,id])]:draft.locked.filter(i=>i!==id);}
  else return;render();
}
function handleClick(event){
  const el=event.target.closest('[data-action]');if(!el||!active())return;
  const {action,side,role,id}=el.dataset;
  if(action==='back')return window.switchView('view-dashboard');
  if(action==='pick')return openPicker({side,role,kind:'pick'});
  if(action==='move')return openMove(side,role);
  if(action==='apply-move'){
    draft=movePick(data,draft,el.dataset.side,el.dataset.role,root.querySelector('#wr-move-to').value);
    root.querySelector('#wr-picker').close();render();return;
  }
  if(action==='bans'||action==='pool')return openPicker({kind:action});
  if(action==='refresh')return refresh();
  if(action==='clear-inventory'){draft.locked=[];draft.owned=[];draft.purchaseTarget='';}
  if(action==='source-build'){const b=championBuilds(champ(draft.blue[draft.role])).find(b=>b.guideId===el.dataset.guide&&b.role===draft.role);if(b&&finalBuildAvailable(data,b.final)){draft.variant=b.guideId;draft.locked=[];draft.owned=[];draft.overrides={};draft.purchaseTarget='';}}
  if(action==='add-coverage'){const a={ally:root.querySelector('#wr-coverage-ally').value,item:root.querySelector('#wr-coverage-item').value,target:root.querySelector('#wr-coverage-target').value};if(draft.teamAssignments.length<10&&!draft.teamAssignments.some(x=>x.ally===a.ally&&x.item===a.item&&x.target===a.target))draft.teamAssignments.push(a);}
  if(action==='remove-coverage')draft.teamAssignments.splice(Number(el.dataset.index),1);
  if(action==='add-owned'){const item=root.querySelector('#wr-owned-item').value;if(data.items[item]&&draft.owned.length<6)draft.owned.push(item);else if(draft.owned.length>=6)toast('En fazla altı parça veya eşya girebilirsin.');}
  if(action==='add-enemy-item'){
    const enemy=root.querySelector('#wr-enemy-target').value,item=root.querySelector('#wr-enemy-item').value,items=draft.enemyItems[enemy]||[];
    if(items.length>=6)toast('Bir rakip için en fazla altı eşya girilebilir.');else if(!items.includes(item))draft.enemyItems[enemy]=[...items,item];
  }
  if(action==='remove-enemy-item')draft.enemyItems[id]=(draft.enemyItems[id]||[]).filter(i=>i!==el.dataset.item);
  if(action==='remove-owned')draft.owned.splice(Number(el.dataset.index),1);
  if(action==='saved')return openSaved();
  if(action==='feedback')return openFeedback(id);
  if(action==='save-draft')return saveDraft();
  if(action==='send-feedback')return saveFeedback();
  if(action==='export-feedback')return exportFeedback();
  if(action==='load-draft'){const saved=workspace.saved[Number(el.dataset.index)];if(saved){draft=sanitizeDraft(saved.draft,data);root.querySelector('#wr-picker').close();}render();return;}
  if(action==='delete-draft'){workspace.saved.splice(Number(el.dataset.index),1);saveWorkspace();openSaved();return;}
  if(action==='undo'||action==='redo'){const restored=history[action]();if(restored)draft=sanitizeDraft(restored,data);render();return;}
  if(action==='more')showAll=!showAll;
  if(action==='clear-compare')draft.compare=[];
  if(action==='tab')draft.tab=el.dataset.tab;
  if(action==='remove'){draft.uncertain=draft.uncertain.filter(id=>id!==draft[side][role]);delete draft[side][role];if(side==='blue'&&role===draft.role){draft.locked=[];draft.overrides={};draft.owned=[];}if(!Object.values(draft.red).includes(draft.fed))draft.fed='';}
  if(action==='choose'){draft.blue[draft.role]=id;draft.locked=[];draft.overrides={};draft.owned=[];draft.tab='build';}
  if(action==='reset'){draft={...emptyDraft(),comfort:draft.comfort,pool:draft.pool,rank:draft.rank,role:draft.role};}
  render();
}
function workspaceDialog(title,body){
  const dialog=root.querySelector('#wr-picker');picker=null;
  dialog.innerHTML=`<header><h2 id="wr-picker-title">${title}</h2><button class="secondary" id="wr-picker-close" aria-label="Pencereyi kapat">×</button></header>${body}`;
  dialog.querySelector('#wr-picker-close').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();return dialog;
}
function openMove(side,role){
  const c=champ(draft[side][role]);if(!c)return;
  workspaceDialog('Koridoru değiştir',`<p>${esc(c.name)} için yeni koridoru seç. Hedef koridor doluysa iki şampiyon yer değiştirir.</p><label>Yeni koridor<select id="wr-move-to">${Object.entries(ROLES).map(([id,name])=>`<option value="${id}" ${id===role?'selected':''}>${name}${draft[side][id]?' · '+esc(champ(draft[side][id])?.name):''}</option>`).join('')}</select></label><button data-action="apply-move" data-side="${side}" data-role="${role}">Yerleşimi uygula</button>`);
}
function openSaved(){
  workspaceDialog('Kayıtlı seçimler',`<p class="wr-muted">Bu hesap için bu cihazda en fazla sekiz seçim kaydedilir. Kayıt yüklenince güncel verilerle yeniden hesaplanır.</p><label>Seçim adı<input id="wr-save-name" type="text" maxlength="60" placeholder="Örneğin: Arkadaşlarla ejder koridoru"></label><button data-action="save-draft">Mevcut seçimleri kaydet</button><div class="wr-saved-list">${workspace.saved.map((s,i)=>`<article><div><b>${esc(s.name)}</b><small>${date(s.savedAt)}</small></div><button class="secondary" data-action="load-draft" data-index="${i}">Yükle</button><button class="secondary" data-action="delete-draft" data-index="${i}" aria-label="${esc(s.name)} kaydını sil">Sil</button></article>`).join('')||'<p class="wr-muted">Henüz kayıt yok.</p>'}</div>`);
}
function saveDraft(){
  const name=root.querySelector('#wr-save-name').value.trim();if(!name){toast('Seçim için bir ad yaz.');return;}
  if(workspace.saved.length>=8){toast('Sekiz kayıt sınırına ulaştın. Bir kaydı silip tekrar dene.');return;}
  workspace.saved.push({name:name.slice(0,60),savedAt:new Date().toISOString(),draft:structuredClone(draft)});saveWorkspace();openSaved();
}
function openFeedback(id){
  feedbackId=id;
  workspaceDialog('Öneri değerlendirmesi',`<p>${esc(champ(id)?.name)} önerisinde gördüğün sorunu kaydet. Kayıtlar bu cihazda kalır; otomatik gönderilmez veya sıralamayı kendiliğinden değiştirmez.</p><label>Neden<select id="wr-feedback-reason"><option value="matchup">Koridor eşleşmesi hatalı</option><option value="team">Takım uyumu zayıf</option><option value="data">Veri güncel değil</option><option value="useful">Öneri faydalı</option><option value="other">Başka bir sorun</option></select></label><label>Açıklama<textarea id="wr-feedback-note" maxlength="500" rows="3" placeholder="Hangi durumda, neden farklı bir seçim bekliyorsun?"></textarea></label><button data-action="send-feedback">Değerlendirmeyi kaydet</button><button class="secondary" data-action="export-feedback">Kayıtları indir (${workspace.feedback.length})</button>`);
}
function saveFeedback(){
  workspace.feedback.push({champion:feedbackId,reason:root.querySelector('#wr-feedback-reason').value,note:root.querySelector('#wr-feedback-note').value.trim().slice(0,500),patch:data.latestPatch.version,at:new Date().toISOString(),methodology:2,draft:structuredClone(draft)});
  workspace.feedback=workspace.feedback.slice(-50);saveWorkspace();root.querySelector('#wr-picker').close();toast('Değerlendirme bu cihazda kaydedildi.','success');
}
function exportFeedback(){
  const blob=new Blob([JSON.stringify({version:1,feedback:workspace.feedback},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='wild-rift-degerlendirmeleri.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
    draft.uncertain=draft.uncertain.filter(i=>i!==draft[picker.side][picker.role]);draft[picker.side][picker.role]=id;if(picker.side==='blue'&&picker.role===draft.role){draft.locked=[];draft.overrides={};draft.owned=[];}
    if(!Object.values(draft.red).includes(draft.fed))draft.fed='';
    root.querySelector('#wr-picker').close();render();
  }else{const key=picker.kind;draft[key]=draft[key].includes(id)?draft[key].filter(x=>x!==id):[...draft[key],id];remember();renderPicker();}
}
async function refresh(){
  if(updating)return;updating=true;render();
  const message=text=>{const box=root?.querySelector('#wr-update-message');if(box)box.textContent=text;};
  try{
    if(staticMode()){
      message('GitHub Pages üzerinde yayımlanmış son paket kontrol ediliyor…');
      const before=data.checkedAt,next=await publishedSnapshot(controller.signal);if(!active())return;
      accept(next);render();message(before===data.checkedAt?'Yayımlanan son paketi kullanıyorsun. Kaynak taraması bilgisayardaki güncelleyici tarafından yapılır.':'Yeni yayımlanan veri paketi yüklendi.');return;
    }
    message('Kaynaklar kontrol ediliyor. Son sağlam öneriler kullanılmaya devam ediyor.');
    let status=await api('/refresh','POST'),attempt=0;
    while(status.running&&active()&&attempt++<420){
      await new Promise(resolve=>{pollResolve=resolve;pollTimer=setTimeout(resolve,2000);});
      if(!active())return;status=await api('/status');serviceStatus=status;
      if(status.running)message(`${status.phase||'Kaynaklar kontrol ediliyor'}${status.total?' · '+status.completed+'/'+status.total:''}. Son sağlam öneriler kullanılmaya devam ediyor.`);
    }
    if(status.error)throw new Error(status.error);
    if(status.running)throw new Error('Kontrol sunucuda sürüyor. Biraz sonra yeniden kontrol edebilirsin.');
    const next=await api();if(!active())return;accept(next);render();toast('Yama, istatistik ve rehber verileri kontrol edildi.','success');
  }catch(e){if(active()){const text=errorInTurkish(e);message(text);toast(text,'error');}}
  finally{updating=false;const button=root?.querySelector('[data-action="refresh"]');if(button){button.disabled=false;button.textContent='↻ Güncel verileri kontrol et';}}
}
window.addEventListener('wr-access-revoked',()=>{controller?.abort();clearTimeout(queryTimer);clearTimeout(pollTimer);pollResolve?.();owner=null;draft=emptyDraft();picker=null;updating=false;history.reset(draft);workspace={saved:[],feedback:[]};lastSaved='';renderTimes=[];});
