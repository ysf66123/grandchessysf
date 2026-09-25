import {ageInDays} from './wild-rift-quality.mjs?v=20260925-counters2';
export const PHASES={draft:'Seçim aşaması / genel plan',lane:'Koridor ve ilk eşyalar',team:'Takım savaşları'};
export const BUILD_PRIORITIES={balanced:'Dengeli',survive:'Hayatta kalma öncelikli',damage:'Hasar düzenini koru'};
export const NEED_LABELS={heal:'İyileşme',shield:'Kalkan',magic:'Büyü hasarı',physical:'Fiziksel hasar',cc:'Kontrol etkileri',burst:'Ani hasar',tank:'Dayanıklı hedef',health:'Can yatırımı',trueDamage:'Gerçek hasar',attack:'Normal saldırılar',critical:'Kritik vuruş yatırımı',armor:'Zırh yatırımı',magicResist:'Büyü direnci yatırımı'};
export const TEAR_ITEMS=['tear-of-the-goddess','manamune','muramana','archangels-staff','seraphs-embrace','winters-approach','fimbulwinter','whispering-circlet','diadem-of-songs'];
export const BOOTS=['berserkers-greaves','boots-of-mana','boots-of-dynamism','mercurys-treads','plated-steelcaps','ionian-boots-of-lucidity','gluttonous-greaves'];
export const SUPPORT_ITEMS=['bulwark-of-the-mountain','black-mist-scythe','relic-shield','spectral-sickle'];
export const itemFamily=id=>TEAR_ITEMS.includes(id)?'tear':id;
export function itemConflicts(items,id){
 const groups=[TEAR_ITEMS,BOOTS,SUPPORT_ITEMS,['mortal-reminder','seryldas-grudge','lord-dominiks-regard','terminus'],['trinity-force','divine-sunderer','iceborn-gauntlet','lich-bane'],['steraks-gage','maw-of-malmortius','immortal-shieldbow']];
 return items.includes(id)||groups.some(g=>g.includes(id)&&items.some(i=>g.includes(i)));
}
export function itemFacts(data,id,now=Date.now()){
 const i=data.items[id]||{},stats={},effects={},mechanics={},conflicts=[],sources=[];
 const valid=(patch,date)=>patch===data.latestPatch.version&&ageInDays(date,now)<=7;
 const core=valid(i.coreFacts?.patch,i.coreFacts?.checkedAt)?i.coreFacts:null;
 const fire=valid(i.statsPatch||i.costPatch,i.statsCheckedAt||i.costCheckedAt)?i.stats:null;
 const official=valid(i.official?.patch,i.official?.checkedAt)?i.official?.stats:null;
 if(core){Object.assign(stats,core.stats);Object.assign(effects,core.effects);Object.assign(mechanics,core.mechanics);sources.push('wildriftcore');}
 if(fire){Object.assign(stats,fire);sources.push('wildriftfire');}
 if(core&&fire)for(const [key,value] of Object.entries(fire))if(Number.isFinite(core.stats?.[key])&&core.stats[key]!==value&&!Number.isFinite(official?.[key])){delete stats[key];conflicts.push(key);}
 if(official){Object.assign(stats,official);sources.push('riot');}
 if(valid(i.effectsPatch,i.effectsCheckedAt)){for(const k of Object.keys(effects))delete effects[k];Object.assign(effects,i.effects);}
 if(valid(i.mechanicsPatch,i.mechanicsCheckedAt)){for(const k of Object.keys(mechanics))delete mechanics[k];Object.assign(mechanics,i.mechanics);}
 return {stats,effects,mechanics,conflicts,sources,known:!!(fire||core||official),effectsKnown:!!core||valid(i.effectsPatch,i.effectsCheckedAt)};
}
// This interpretation must be reviewed when the gameplay patch changes. Raw
// current stats can still be displayed; old semantic weights cannot be reused.
export const RULES_PATCH='7.3';
// Verified 7.3 automatic forms: these occupy the same slot as the purchased
// parent. They must not be shown as a second shop purchase.
export const TRANSFORM_FROM={'muramana':'manamune','seraphs-embrace':'archangels-staff','fimbulwinter':'winters-approach','diadem-of-songs':'whispering-circlet'};
// Explanatory item roles. These never introduce a swap outside the champion's guide.
export const ITEM_ROLES={
 'zhonyas-hourglass':{covers:{burst:1,physical:.45},loss:'Zamanlamayla kullanılan staz savunmasından vazgeçersin.'},
 'guardian-angel':{covers:{burst:1,physical:.4},loss:'Yeniden dirilme güvencesinden vazgeçersin.'},
 'banshees-veil':{covers:{cc:.8,magic:.7},loss:'Büyü kalkanı ve büyü direnci güvencen azalır.'},
 'edge-of-night':{covers:{cc:.8},loss:'Büyü kalkanı güvencen azalır.'},
 'mercurial-scimitar':{covers:{cc:1},loss:'Aktif arındırma seçeneğinden vazgeçersin.'},
 'mikaels-blessing':{covers:{cc:1},loss:'Takım arkadaşını kontrol etkisinden kurtarma seçeneğin azalır.'},
 'mortal-reminder':{covers:{heal:1,armor:.7},loss:'İyileşme azaltma ve zırh delme katkın azalır.'},
 'morellonomicon':{covers:{heal:1},loss:'İyileşme azaltma katkından vazgeçersin.'},
 'thornmail':{covers:{heal:.85,physical:.7},loss:'Zırh ve iyileşme azaltma katkın azalır.'},
 'oceanids-trident':{covers:{shield:1},loss:'Kalkan azaltma katkından vazgeçersin.'},
 'serpents-fang':{covers:{shield:1},loss:'Kalkan azaltma katkından vazgeçersin.'},
 'randuins-omen':{covers:{critical:1,physical:.7},loss:'Kritik vuruşlara karşı savunman azalır.'},
 'frozen-heart':{covers:{attack:.9,physical:.65},loss:'Normal saldırı baskısına karşı savunman azalır.'},
 'mercurys-treads':{covers:{magic:.6,cc:.25},loss:'Büyü direnci botundan vazgeçersin.'},
 'plated-steelcaps':{covers:{physical:.6,attack:.35},loss:'Fiziksel saldırılara karşı bot koruman azalır.'},
 'maw-of-malmortius':{covers:{magic:1,burst:.25},loss:'Büyü hasarına karşı savunman azalır.'},
 'force-of-nature':{covers:{magic:1},loss:'Uzayan büyü hasarına karşı dayanıklılığın azalır.'},
 'kaenic-rookern':{covers:{magic:1},loss:'Büyü hasarına karşı dayanıklılığın azalır.'},
 'hollow-radiance':{covers:{magic:.7},loss:'Büyü direnci ve alan etkili katkından vazgeçersin.'},
 'sunfire-aegis':{covers:{physical:.35},loss:'Yakındaki hedeflere karşı sürekli hasar katkın değişir.'},
 'immortal-shieldbow':{covers:{burst:.7},loss:'Düşük canda sağladığı savunma güvencen azalır.'},
 'void-staff':{covers:{magicResist:1,tank:.25},loss:'Büyü direnci yatırımlarına karşı delme gücün azalır.'},
 'bloodletters-curse':{covers:{magicResist:.85,tank:.4},loss:'Uzayan çatışmalardaki büyü direnci azaltma katkın azalır.'},
 'liandrys-torment':{covers:{tank:1},loss:'Dayanıklı hedeflere karşı uzayan hasar katkın azalır.'},
 'blade-of-the-ruined-king':{covers:{tank:.9},loss:'Normal saldırılara dayalı sürekli hasar ve can çalma düzenin değişir.'},
 'lord-dominiks-regard':{covers:{armor:1},loss:'Zırh delme ve hasar odaklı pasif avantajının bir bölümünü bırakırsın.'},
 'seryldas-grudge':{covers:{armor:.9},loss:'Zırh delme ve yavaşlatma düzenin değişir.'},
 'terminus':{covers:{armor:.6,magicResist:.6},loss:'Normal saldırılarla biriken delme ve savunma düzenin değişir.'},
 'bloodthirster':{covers:{},loss:'Can çalma ve yüksek saldırı gücüyle toparlanma avantajından vazgeçersin.'},
 'boots-of-mana':{covers:{},loss:'Botun büyü hasarı ve mana avantajından vazgeçersin.'},
 'berserkers-greaves':{covers:{},loss:'Botun saldırı hızı avantajından vazgeçersin.'}
};
