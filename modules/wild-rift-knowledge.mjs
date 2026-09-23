export const ROLES={baron:'Baron koridoru',jungle:'Orman',mid:'Orta koridor',duo:'Ejder koridoru',support:'Destek'};
export const RANKS={diamond:'Elmas ve üzeri',master:'Ustalık ve üzeri',challenger:'Şampiyonluk',apex:'Efsanevi dereceli'};
export const BOOT_UPGRADES={
 'boots-of-mana':'Sahir Pabuçları','mercurys-treads':'Zincirli Eziciler','berserkers-greaves':'Bakır-Çinko Çizmeler','plated-steelcaps':'Zırhlı Atılım','gluttonous-greaves':'Ölümsüz Adımlar','boots-of-dynamism':'Zırhkıran Çizme','ionian-boots-of-lucidity':'Kızıl Ionia Çizmeleri'
};
// Conservative, explicit mechanical traits. Missing knowledge is never inferred as a counter.
const groups={
  magic:'ahri akali amumu annie aurelion-sol aurora bard brand diana ekko evelynn fiddlesticks fizz galio gragas gwen heimerdinger janna karma kassadin katarina kennen kogmaw lillia lissandra lulu lux malphite maokai mel milio mordekaiser morgana nami nidalee norra nunu-amp-willump orianna rakan rumble ryze seraphine singed sona soraka swain syndra taliyah teemo veigar velkoz vex viktor vladimir yuumi ziggs zilean zoe zyra',
  mixed:'corki ezreal jax kaisa kayle nasus shyvana smolder varus volibear warwick yone zeri',
  tank:'alistar amumu braum chogath dr-mundo galio ksante leona malphite maokai nautilus nunu-amp-willump ornn poppy rammus rell shen sion skarner thresh',
  heal:'aatrox dr-mundo fiora gwen irelia kayn maokai master-yi nami nilah olaf renekton rengar senna sona soraka swain vladimir volibear warwick yuumi',
  shield:'ambessa camille galio janna karma lulu lux milio mordekaiser orianna rakan riven seraphine sett shen sona thresh urgot vi yone yuumi',
  cc:'alistar amumu annie ashe aurelion-sol bard blitzcrank braum chogath fiddlesticks galio gnar gragas heimerdinger janna jarvan-iv karma kennen leona lissandra lux malphite maokai morgana nami nautilus norra nunu-amp-willump ornn pantheon poppy rakan rammus rell ryze sejuani seraphine sett shen sion skarner sona swain syndra taliyah thresh twisted-fate veigar vex vi volibear warwick wukong yasuo yone zac zilean zoe zyra',
  burst:'ahri akali annie diana ekko evelynn fizz jayce kassadin katarina khazix leblanc lissandra lux malphite mel nidalee nocturne pantheon rengar syndra talon veigar vex zed zoe',
  poke:'brand caitlyn ezreal heimerdinger jayce karma kogmaw lux mel morgana nidalee orianna seraphine senna syndra varus velkoz viktor xerath ziggs zoe zyra',
  mobile:'ahri akali akshan ambessa aurora camille diana ekko evelynn ezreal fiora fizz gnar graves gwen hecarim irelia jarvan-iv jax kaisa kalista kassadin katarina kayn khazix kindred ksante lee-sin lillia lucian nidalee nilah pantheon pyke rakan rengar riven samira talon tristana tryndamere vi viego wukong xin-zhao yasuo yone zed zeri',
  attack:'akshan ashe caitlyn corki draven ezreal graves irelia jax jhin jinx kaisa kalista kayle kindred kogmaw lucian master-yi miss-fortune nilah samira senna sivir smolder tristana tryndamere twitch vayne xayah yasuo yone yunara zeri',
  peel:'alistar braum galio janna karma lulu milio nami poppy shen thresh',
  engage:'alistar amumu diana galio gragas hecarim jarvan-iv kennen leona malphite maokai nautilus ornn rakan rammus rell sett sion skarner vi wukong',
  tankbuster:'brand fiora gwen kaisa kayle kogmaw lillia master-yi varus vayne',
  scaling:'aurelion-sol jinx kassadin kayle kogmaw master-yi nasus smolder veigar vladimir'
};
const sets=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,new Set(v.split(' '))]));
export function traits(c){
  if(!c)return {};
  const t=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.has(c.id)]));
  t.damage=t.magic?'magic':t.mixed?'mixed':'physical';
  t.tank ||= c.tags?.includes('Tank') || false;
  return t;
}
export const CONDITIONS={
  'Active item alternative':{key:'manual',label:'Aktif eşya alternatifi (aynı yuvayı kullanır)'},
  'vs Shielding (Build 3rd)':{key:'shield',label:'Kalkanlara karşı; üçüncü eşya seçeneği'},
  'vs AP / CC':{key:'magic',label:'Büyü hasarı ve kontrol etkilerine karşı'},
  'vs Critical Strike Damage':{key:'attack',label:'Kritik vuruş tehdidine karşı'},
  'vs Critial Strike Damage':{key:'attack',label:'Kritik vuruş tehdidine karşı'},
  'For More Damage':{key:'manual',label:'Daha fazla hasar için alternatif'},
  'vs Healing':{key:'heal',label:'İyileşmeye karşı'}, 'vs Heavy Healing':{key:'heal',label:'Yoğun iyileşmeye karşı'},
  'vs Shielding':{key:'shield',label:'Kalkanlara karşı'}, 'vs Shields':{key:'shield',label:'Kalkanlara karşı'},
  'vs Tanks':{key:'tank',label:'Dayanıklı ön saflara karşı'}, 'vs Crowd Control':{key:'cc',label:'Kontrol etkilerine karşı'},
  'vs Magic Damage':{key:'magic',label:'Büyü hasarına karşı'}, 'vs Ability Power':{key:'magic',label:'Büyü hasarına karşı'},
  'vs Physical Damage':{key:'physical',label:'Fiziksel hasara karşı'}, 'vs Attack Damage':{key:'physical',label:'Fiziksel hasara karşı'},
  'vs Assassins':{key:'burst',label:'Ani hasara karşı'}, 'vs Burst Damage':{key:'burst',label:'Ani hasara karşı'},
  'vs Attack Speed':{key:'attack',label:'Normal saldırı baskısına karşı'}
};
export const CHAMPION_TIPS={
  ahri:'Baştan çıkarma yeteneğini boşa harcamadan takas başlat. Hareket yeteneğinin bir kullanımını geri çıkış için sakla.',
  syndra:'Rakibin yaklaşma yoluna küre yerleştir; itme yeteneğini kullandıktan sonra baskına açık kalacağını hesaba kat.',
  malphite:'Zırh odaklı gücün büyü hasarına karşı aynı korumayı sağlamaz. Ultiyle girişten önce takımının takip mesafesini kontrol et.',
  yasuo:'Minyonlara atılmadan önce geri çıkış yolunu belirle. Rüzgâr duvarını önemsiz bir atış için tüketme.',
  yone:'Ruh biçimine girmeden önce geri döneceğin noktanın güvenli olduğundan emin ol; rakibin kontrol yeteneğini takip et.',
  zed:'Gölgeni hem takas hem kaçış için aynı anda kullanamazsın. Rakibin savunma etkisi hazırsa tüm hasarını tek seferde harcama.',
  fiora:'Hayati noktaya erişirken rakibin kontrol yeteneği için savuşturmayı sakla; kötü açıda uzun dövüşü zorlama.',
  jax:'Karşı saldırıyı rakibin normal saldırı penceresine denk getir; atılmayı harcamadan kaçış ihtiyacını değerlendir.',
  darius:'Rakibin kısa takasla uzaklaşmasına izin vermeden yüklerini takip et; yakalama yeteneğin yokken menzilli baskıyı kovalamamaya dikkat et.',
  teemo:'Kör etme yeteneğini rakibin güçlendirilmiş normal saldırısına sakla; görüşsüz nehirde menzil avantajına güvenme.',
  soraka:'İyileştirme yaparken kendi canını ve konumunu koru; rakibin dalış mesafesinin dışında kal.',
  lulu:'Dönüştürmeyi rakibin taşıyıcına atıldığı ana sakla; bütün savunma yeteneklerini aynı anda tüketme.',
  blitzcrank:'Çekme tehdidi bazen çekmekten daha değerlidir. Minyon hattını ve çektiğin hedefin takımına giriş sağlayıp sağlamadığını kontrol et.',
  ezreal:'Yetenek atışlarını minyon dalgasının engellemediği açılardan kullan; kaçış yeteneğini gereksiz ileri takas için tüketme.',
  jinx:'Ön safların arkasından en güvenli hedefe vur. İlk düşen rakipten sonra gelen hızlanmayla yeniden konumlan.',
  vayne:'Duvara itme açısını hazırlarken kendi kaçış yolunu kaybetme. Koridor baskısı altında son vuruş ve can koruma öncelikli.',
  'lee-sin':'İkinci atılmadan önce çıkış imkânını hesapla. Baskın uğruna başarısız takipte orman kamplarını ve objektif zamanını kaybetme.',
  rammus:'Normal saldırı odaklı hedeflere yaklaşırken takımının hasar takibini bekle; büyü ağırlıklı takıma karşı yalnızca zırh biriktirme.',
  gwen:'Koruyucu alanını rakibin önemli menzilli tehdidine sakla. Uzun dövüşte güçlenirken menzil ve yüklerini takip et.'
};
