import {attackModel} from './wild-rift-attack-model.mjs?v=20261001-interactions1';
import {defensePlan} from './wild-rift-defense.mjs?v=20261001-interactions1';
import {itemName} from './wild-rift-tr.mjs?v=20261001-interactions1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n.toLocaleString('tr-TR',{maximumFractionDigits:2});
const link=v=>{try{const u=new URL(v);return u.protocol==='https:'&&['wildrift.leagueoflegends.com','www.wildriftfire.com','wildriftcore.com','wr-meta.com'].includes(u.hostname)?u.href:'#';}catch{return '#';}};
export function defenseView(data,result){
 const rows=defensePlan(data,result);if(!rows.length)return '';
 const kinds={revive:'Pasif dirilme',stasis:'Aktif staz',cleanse:'Arındırma',spellShield:'Pasif büyü kalkanı'};
 return `<section class="wr-defense-plan"><div class="wr-block-title"><h3>Savunmanı nasıl kullanmalısın?</h3><span>Seçili setin kaynak etkileri</span></div><div class="wr-defense-grid">${rows.map(r=>`<article><small>${kinds[r.kind]}${r.recipient==='ally'?' · Takım arkadaşına':''}</small><b>${esc(itemName(r.id))}</b><p>${esc(r.reason)}</p>${r.targets?.length?`<span>İlgili rakipler: ${r.targets.map(esc).join(', ')}</span>`:''}</article>`).join('')}</div></section>`;
}
export function attackView(data,result){
 const m=attackModel(data,result.champion,result.fit.stats,result.final);if(!m.known)return '';
 const modes={slow:'Kritik, yavaşlatma etkisi taşır',pellets:'Saçma ve dolum düzeni',fixedShots:'Sabit ritim ve dört atış',ordinary:'Normal kritik hesabı'};
 return `<details class="wr-details wr-attack-model"><summary>Şampiyonuna özel saldırı ve kritik yatırımı</summary><div class="wr-chips"><span>9. seviye kaynak referansı</span><span>${m.fixed?'Sabit özel saldırı ritmi':m.attackKnown?num(m.speed)+' saldırı/sn':'Saldırı hızı kaydı eksik veya çelişkili'}</span><span>Kritik ihtimali: %${num(m.crit)}</span><span>${modes[m.mode]}</span>${m.mode==='ordinary'?`<span>Kaynak kritik çarpanı: ×${num(m.multiplier)}</span>`:''}${m.overflowAD?`<span>Fazla kritik dönüşümü: +${num(m.overflowAD)} SG</span>`:''}</div>${m.capped?`<p>${m.excessConversion?'Sınırı aşan saldırı hızı, kaynakta belirtilen özel saldırı gücü dönüşümüne sahip.':'Bu referansta saldırı hızı sınırının üzerindeki yatırım ek saldırı olarak sayılmadı.'}</p>`:''}<p class="wr-muted">${esc(m.basis)} Jhin, Ashe ve Graves gibi özel vuruş düzenlerine normal kritik hasarı uygulanmaz. Bu panel gerçek hasar veya canlı saldırı hızı değildir.</p><a href="${link(m.source)}" target="_blank" rel="noopener noreferrer">Resmî nitelik tablosu ↗</a></details>`;
}
export function counterfactualView(result){
 const rows=result.counterfactuals||[];if(!rows.length)return '';
 return `<details class="wr-details wr-counterfactuals"><summary>Koşullar değişirse hesaplanan eşya planı</summary><p class="wr-muted">En fazla üç olası durum, aynı motorla ayrı ayrı yeniden hesaplanır. Bunlar varsayımdır; mevcut seçimlerine veya gözlemlerine eklenmez.</p><div class="wr-scenario-grid">${rows.map(r=>`<article><small>${r.changed?'SET DEĞİŞİYOR':'SET KORUNUYOR'}</small><h3>${esc(r.condition)}</h3>${r.changed?`<p class="wr-scenario-out">${r.removed.map(itemName).map(esc).join(' + ')}</p><p class="wr-scenario-in">→ ${r.added.map(itemName).map(esc).join(' + ')}</p>`:'<p>Aynı set yeniden hesaplandığında da korundu. Gereksiz karşı eşya eklenmedi.</p>'}<p>${esc(r.basis)}</p><span>${esc(r.confidence)}</span><a href="${link(r.source)}" target="_blank" rel="noopener noreferrer">Kaynak ↗</a></article>`).join('')}</div></details>`;
}
export function tradeoffView(a){
 const s=a.assessment;if(!s)return '';
 return `<div class="wr-swap-assessment"><p>${s.losses.length?'Doğrulanan nitelik kaybı: '+s.losses.map(x=>esc(x.label)+' −'+num(x.value)).join(' · '):'Bu değişiklikte doğrulanan eşya niteliklerinde kayıp yok.'}</p>${s.defense.known?`<p>${esc(s.defense.reason)}</p>`:''}<details><summary>Katkı ve maliyet karşılaştırması</summary><dl><div><dt>Rakip ihtiyaçlarına katkı farkı</dt><dd>${num(s.benefit)}</dd></div><div><dt>Ana düzen maliyeti farkı</dt><dd>${num(s.coreCost)}</dd></div><div><dt>Gereksiz değişikliği önleyen eşik</dt><dd>${num(s.transitionCost)}</dd></div><div><dt>Net kural puanı</dt><dd>${num(s.net)}</dd></div></dl><p class="wr-muted">${esc(s.basis)} Negatif maliyet, ana eşya katkısının iyileştiğini belirtir.</p></details></div>`;
}
