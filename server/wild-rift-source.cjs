const { load } = require('cheerio');
const { createHash } = require('node:crypto');
const BASE = 'https://www.wildriftfire.com';
const PATCH_URL = 'https://wildrift.leagueoflegends.com/tr-tr/news/tags/patch-notes/';
const roles = { Solo:'baron', Baron:'baron', Jungle:'jungle', Mid:'mid', Duo:'duo', Support:'support' };
const slug = value => String(value).split('/').filter(Boolean).pop();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,16);
async function fetchText(url) {
  const response = await fetch(url, { signal:AbortSignal.timeout(20000), headers:{'User-Agent':'Grandmaster-WildRift/1.0 (cached factual game data)'} });
  if (!response.ok) throw new Error(`Kaynak yanıtı: ${response.status}`);
  const text = await response.text();
  if (text.length > 10000000) throw new Error('Kaynak boyutu beklenenden büyük.');
  return text;
}
function parseStats(html) {
  const $ = load(html), raw = JSON.parse($('#wf-stats-data').text());
  if (!/^\d+\.\d+[a-z]?$/.test(raw.patch) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.updated)) throw new Error('İstatistik sürümü doğrulanamadı.');
  const brackets = {};
  for (const key of ['diamond','master','challenger','apex']) {
    const rows = raw.brackets?.[key]?.rows;
    if (!Array.isArray(rows) || rows.length < 50) throw new Error('İstatistik kapsamı eksik.');
    brackets[key] = rows.map(r => {
      if (!roles[r.role] || !/^[a-z0-9-]+$/.test(r.slug) || ![r.win,r.pick,r.ban].every(n => Number.isFinite(n) && n>=0 && n<=100)) throw new Error('Geçersiz istatistik satırı.');
      return {id:r.slug,name:r.champion,role:roles[r.role],tier:String(r.tier).toUpperCase().replace('PLUS','+'),win:r.win,pick:r.pick,ban:r.ban};
    });
  }
  return {patch:raw.patch,asOf:raw.updated,region:'CN',sampleSize:null,source:BASE+'/stats',brackets};
}
function parseCatalog(html) {
  const $ = load(html), map = new Map();
  $('.wf-tier-list__tiers__main a.ico-holder[data-role]').each((_,e) => {
    const id = slug($(e).attr('href')), role = roles[$(e).attr('data-role')];
    if (!role || !/^[a-z0-9-]+$/.test(id)) return;
    const name = $(e).find('.item-holder img').attr('alt');
    if (!name) return;
    const tierClass = ($(e).closest('.tier').attr('class')||'').split(' ').find(x=>['splus','s','a','b','c'].includes(x));
    const portrait=new URL($(e).find('.item-holder img').attr('src')||'/images/champion/icon/'+id+'.png',BASE);
    if(!['www.wildriftfire.com','www.mobafire.com'].includes(portrait.hostname)||portrait.protocol!=='https:')throw new Error('Şampiyon görseli kaynağı doğrulanamadı.');
    if (!map.has(id)) map.set(id,{id,name,roles:[],tiers:{},guide:BASE+'/guide/'+id,portrait:portrait.href});
    const c=map.get(id); if (!c.roles.includes(role)) c.roles.push(role);
    c.tiers[role]=(tierClass||'').toUpperCase().replace('PLUS','+');
  });
  if (map.size < 80) throw new Error('Şampiyon kataloğu doğrulanamadı.');
  return [...map.values()];
}
function parsePatch(html) {
  const $=load(html), found=[];
  $('a[href*="/news/game-updates/"]').each((_,e)=>{
    const href=$(e).attr('href'), match=href.match(/patch-notes-(\d+)-(\d+)([a-z]?)(?:\/|$)/);
    if (!match) return;
    const date=$(e).find('time').attr('datetime')||null;
    if(date && Date.parse(date)>Date.now())return;
    if(new URL(href,PATCH_URL).hostname!=='wildrift.leagueoflegends.com')return;
    found.push({version:`${match[1]}.${match[2]}${match[3]}`,url:new URL(href,PATCH_URL).href,publishedAt:date});
  });
  if (!found.length) throw new Error('Resmî yama listesi okunamadı.');
  found.sort((a,b)=>comparePatch(b.version,a.version));
  return found[0];
}
function comparePatch(a,b) { const split=s=>s.match(/(\d+)\.(\d+)([a-z]?)/).slice(1); const x=split(a),y=split(b); return +x[0]-+y[0] || +x[1]-+y[1] || x[2].localeCompare(y[2]); }
function parseGuide(html,champion) {
  const $=load(html), patch=$('#patch').val();
  if (!/^\d+\.\d+[a-z]?$/.test(patch||'')) throw new Error('Dizilim sürümü bulunamadı.');
  const items={};
  const names = element => $(element).find('.ico-holder').map((_,e)=>{
    const name=$(e).find('.name').first().text().trim(), src=$(e).find('img').first().attr('src');
    if (!name || !src?.includes('/items/')) return null;
    const id=slug(src).replace(/\.png.*$/,'');
    if (!/^[a-z0-9-]+$/.test(id)) return null;
    items[id]={id,name,icon:new URL(src,BASE).href}; return id;
  }).get();
  const builds=[];
  $('.wf-champion__data__items[data-guide-id]').each((_,e)=>{
    const guideId=$(e).attr('data-guide-id');
    const related=selector=>$(selector).filter((_,x)=>$(x).attr('data-guide-id')===guideId);
    const roleNode=$(`[data-guide-id="${guideId}"]`).filter((_,x)=>$(x).attr('data-role') || $(x).attr('data-lane')).first();
    const tabRole=$(`span[data-guide-id="${guideId}"]`).first().text().trim().split(/\s+/)[0];
    const role=roles[roleNode.attr('data-role')||roleNode.attr('data-lane')] || roles[tabRole] || (champion.roles.length===1?champion.roles[0]:null);
    const final=names($(e).find('.section.final'));
    if (final.length<6 || final.length>7 || new Set(final).size!==final.length) throw new Error(`${champion.name}: tam dizilim doğrulanamadı.`);
    const situational=related('.wf-champion__data__situational').find('.section.situation').map((_,x)=>({condition:$(x).find('span.situation').text().trim(),items:names(x)})).get();
    // Since 7.2, former enchants are full items. Some guides still append one
    // to six occupied slots; retain it as a replacement, never a seventh slot.
    if(final.length===7)situational.push({condition:'Active item alternative',items:[final[5],final.pop()]});
    const spells=related('.wf-champion__data__spells');
    const skills=related('.skills-counters-block');
    const skillOrder=Array.from({length:15},(_,i)=>Number(skills.find(`li.lit[level="${i+1}"]`).closest('ul').attr('data-row'))||null);
    const counters=skills.find('.counters a[href^="/guide/"]').map((_,x)=>slug($(x).attr('href'))).get();
    const synergies=skills.find('.synergies a[href^="/guide/"]').map((_,x)=>slug($(x).attr('href'))).get();
    builds.push({role,guideId,patch,source:champion.guide,starting:names($(e).find('.section.starting')),core:names($(e).find('.section.core')),boots:names($(e).find('.section.boots')),final,situational,
      spells:spells.find('.section.spells .name').map((_,x)=>$(x).text().trim()).get(),runes:spells.find('.section.runes .name').map((_,x)=>$(x).text().trim()).get(),skillOrder,counters,synergies});
  });
  if (!builds.length) throw new Error('Şampiyon rehberi eksik.');
  const tags=$('.wf-champion__about__tags').first().find('span').map((_,x)=>$(x).text().trim()).get();
  return {builds,items,tags,contentHash:hash(JSON.stringify({builds,items,tags})),fetchedAt:new Date().toISOString()};
}
module.exports={BASE,PATCH_URL,fetchText,parseStats,parseCatalog,parsePatch,parseGuide,comparePatch,hash};
