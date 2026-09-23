# Wild Rift asistanı

Türkçe yönetici modudur. Dashboard kartı oturumun yönetici yetkisi doğrulandığında görünür. Mavi takım bizim takımımızdır. Beş rol için rakipleri, kendi şampiyonunu, yasakları ve kişisel havuzunu seçebilirsin. Lig seçimi Çin sunucusu istatistiklerini filtreler; Avrupa istatistiği değildir.

## Çalıştırma

Node.js 22 veya üzeri gerekir. Proje dizininde `npm install`, ardından `npm start` çalıştır. Site `http://localhost:8080` adresindedir. Gömülü veri paketi mevcut olduğu için ilk açılışta 141 rehber yeniden indirilmez. Arka plan kontrolü sunucu başladıktan sonra ve altı saatte bir çalışır; ilk kontrol son paket çok yeniyse atlanır.

`npm run update:wild-rift` verileri komut satırından yeniler. Paneldeki **Güncel verileri kontrol et** düğmesi de gerçek kaynak kontrolünü başlatır. İşlem, kaynakların yanıtına göre birkaç dakika sürebilir. Aynı anda tek güncelleme çalışır; seçim değiştirirken kaynaklara istek gönderilmez.

## Yönetici erişimi

Tercih edilen yöntem Firebase Auth kullanıcısında `admin: true` özel yetkisidir. Güvenilir Firebase proje kimlik bilgileri olan ortamda `node scripts/set-site-admin.cjs KULLANICI_UID` çalıştırılabilir. Mevcut özel yetkiler korunur. Ardından yeniden giriş yap.

Alternatif: `WR_ADMIN_UIDS` ortam değişkenine virgülle ayrılmış UID'ler yaz; aynı UID'leri `site-config.js` içindeki `SITE_ADMIN_UIDS` listesine ekle. Bu liste yalnızca kartı görünür kılar; sunucu her istekte Firebase imzasını ve kendi izin listesini doğrular.

Mevcut sitedeki yönetici e-posta hesabı, Firebase tarafından imzası doğrulanmış oturumla başlangıç yöneticisi olarak desteklenir; mevcut erişim kuralı korunur. Tarayıcıdan gönderilen bir e-posta metni, kullanıcı profilindeki rastgele bir `isAdmin` alanı veya turnuva oda sahibi olma durumu yeni modda yönetici yetkisi sağlamaz. Yeni yöneticiler için UID veya özel yetki yöntemini kullan. Mevcut yönetici hesabının oturumuna ek bir e-posta doğrulama engeli getirilmemiştir.

## GitHub Pages üzerinde yayın

Kaynak taraması bilgisayarda yapılır. GitHub yalnızca siteyi yayımlar; `.github/workflows/wild-rift-pages.yml` artık zamanlanmış veri taraması içermez.

- **VERI-GUNCELLEME-BASLAT.bat:** Otomatik güncelleyiciyi açar. Pencere açık kaldıkça altı saatte bir kaynak kontrolü yapılır. Bilgisayar uykuya giderse/kapalıysa işlem durur; yeniden başlatıldığında süresi gelen kontrol yapılır. Pencereyi kapatmak işlemi durdurur.
- **VERI-SIMDI-GUNCELLE.bat:** Hemen bir tam kontrol yapar ve doğrulanan veriyi gönderir.
- Mevcut yerel sunucudaki güncelleme düğmesi, tam güncelleme komutu ve fiyat/ek kaynak komutları da başarılı yazımdan sonra aynı gönderim adımını kullanır.

Gönderim yalnızca `data/wild-rift.json` dosyasını değiştirir. Bilgisayardaki mevcut Git Credential Manager oturumu kullanılır; kart veya yeni bir API anahtarı istenmez. GitHub oturumunun bu depoya yazma izni olmalıdır. `.wr-local-sync.json` içindeki `enabled` bu bilgisayarda açıktır; bu ayar, gönderim durumları ve kilit dosyası yayın paketine girmez. Başka bilgisayarda otomatik gönderim için aynı yerel ayar ve GitHub oturumu gerekir. `WR_GITHUB_SYNC=false` gönderimi kapatır.

Aynı veri tekrar commit edilmez. SHA kontrolü eşzamanlı değişikliklerin üzerine yazılmasını önler; uzak verinin yaması veya kayıt zamanı daha yeniyse gönderim durur. Süreçler arası kilit iki taramanın aynı dosyayı yazmasını önler. GitHub bağlantısı başarısızsa yerel veri korunur; otomatik güncelleyici açıkken beş dakikada bir tekrar denenir. Kaynak taraması başarılı olmakla GitHub Pages yayınının tamamlanması farklı durumlardır.

Canlı sitedeki **Güncel verileri kontrol et** düğmesi yayımlanan son paketi alır; uzaktan bilgisayarını açmaz. Bilgisayar kapalıyken site son yayımlanan verilerle çalışmaya devam eder.

**Bilinen yayın engeli:** GitHub hesabında faturalandırma kilidi varken veriler depoya gönderilebilse de Pages yayını başarısız olabilir. Veri taramasını bilgisayara taşımak bu hesap kilidini kaldırmaz. GitHub işi artık yalnızca yayın yapar.

Yayın dosyaları `node scripts/build-pages.cjs` ile açık dosya listesinden hazırlanır; sunucu, log, eski veri, önbellek ve kimlik dosyaları içermez. Admin arayüzü hesap yetkisiyle gizlenir; statik veri paketi herkese açıktır.

### İsteğe bağlı Node servisi

Aşağıdaki kurulum yalnızca ayrıca Node sunucusu kullanmak istersen gereklidir.

Dockerfile veya Node destekleyen bir servis kullanarak `server.js` çalıştır:

1. `FIREBASE_PROJECT_ID=chess-14580` ayarla.
2. Gerekiyorsa `WR_ADMIN_UIDS` tanımla; özel yetkiyle çalışan hesaplarda bu zorunlu değil.
3. `WR_ALLOWED_ORIGINS=https://ysf66123.github.io` ayarla. Özel alan adı kullanıyorsan onun kökenini de ekle.
4. Servisin HTTPS adresini `site-config.js` içindeki `WILD_RIFT_API_BASE` değerine yaz. Adresin sonuna `/api/wild-rift` ekleme.
5. Kalıcı depolama kullanıyorsan `WR_DATA_FILE` ile JSON dosyasının yolunu belirt. İlk çalışmada paket bu dizinde yoksa güncelleme oluşturur. Birden fazla sunucu örneği kullanmadan önce ortak depolama ve dağıtık kilit gerekir; mevcut servis tek örnek için tasarlanmıştır.
6. Node sunucusunun devamlı çalışması gerekir. Sıfıra ölçeklenen bir servis seçilirse altı saatlik kontrol için ayrıca zamanlayıcı kurulmalıdır.

Firebase özel anahtarları tarayıcıya veya GitHub Pages'e konulmaz. Token imzasını doğrulamak için proje ID'si yeterlidir; yönetici yetkisi atayan komut ise proje kimlik bilgileri ister. `.env.example` örnektir; ortam değişkenlerini servis ayarlarından ver. Yerel Node 22+ için `node --env-file=.env server.js` kullanılabilir.

## Veri ve karar yöntemi

### 23 Eylül 2026 geliştirmeleri

- İlk üç aday; dengeli, koridor, takım ve güvenli seçim öncelikleri. İstenirse tüm adaylar açılır. Tecrübe en fazla +6 katkı yapar. Aynı anda üç aday karşılaştırılır.
- Kendi şampiyonu takım arkadaşı gibi uyum hesabına katılmaz. Karşılıklı çelişen rehberlerde eşleşme bonusu verilmez. Eski, hatalı veya yedi gündür doğrulanmayan rehberin karşı seçim bilgisi güncel kanıt sayılmaz.
- Çok rollü rakipte **Koridoru henüz belli değil** işareti olası yerleşimleri hesaplar. Sayısal kazanma olasılığı atanmaz; desteklenen en zor senaryo kullanılır. Çakışan yerleşimde eşleşme bonusu kapatılır. ⇄ düğmesi koridorları taşır veya dolu yuvaları yer değiştirir.
- Satın alınmış eşyalar ve ilk iki ana eşya korunurken kaynak alternatifleri elle seçilebilir. Aynı roldeki birden fazla kaynak dizilimi seçilebilir; değiştirince eski satın alma işaretleri temizlenir.
- Güncel tam eşya fiyatları kaynak kataloğundan alınır. Son kontrolde 116 eşya kaydının 96'sı için fiyat doğrulandı. Kalan eşyalara fiyat uydurulmaz. Elindeki parçaları ve altını girebilirsin; parça tarifleri doğrulanmadığı için parça değerleri düşülmez ve kesin tamamlama bedeli verilmez.
- Rakibin aldığı eşyaları elle ekleyebilirsin. Güncel kaynakta bulunan kritik, zırh ve büyü direnci bilgileri tehdit haritasında gösterilir. Kritik karşıtı kurallar yalnızca şampiyonun normal saldırı etiketine bakarak tetiklenmez. Eşyanın geçici etkileri, rünler veya oyuncunun gerçek toplam direnci simüle edilmez.
- Oyun planında rakibin şampiyon ilkeleri, erken dalga/takas bölümü ve partnerle birlikte ikiye iki değerlendirme bulunur. Bu, tüm şampiyon çiftlerini kapsayan uzman onaylı eşleşme veritabanı değildir.
- Son 30 değişikliği geri/ileri alma; hesap başına cihazda sekiz isimli kayıt; son 50 öneri değerlendirmesini yerel saklama ve JSON indirme. Geri bildirim sunucuya otomatik gönderilmez veya sıralamayı kendiliğinden değiştirmez.
- Veri kalitesi paneli rehber güncelliğini ve kaynak tutarsızlıklarını ayırır. Normalleştirilen yedi eşyalı kaynaklar açıkça işaretlenir. Tek topluluk sağlayıcısı bağımsız iki kaynakmış gibi sunulmaz.
- Yerel ekran hazırlama süreleri ve tarayıcının kaynak aktarım ölçümleri gösterilir. Bunlar gerçek kullanıcı izleme sistemi veya bütün sitenin hız garantisi değildir; dışarı veri göndermez.

Sıralama yöntemi sürüm 2: temel ağırlıklar korunur; takım katkısı 24 ile sınırlıdır. Tercihe göre koridor/takım/risk katkısı ağırlıkları değişir. `balanced`: 1/1/1; `lane`: 1,5/0,5/1; `team`: 0,75/1,5/1; `safe`: 1,25/0,75/2. Bunlar kalibre edilmiş kazanma modeli değildir. Ekrandaki karar dayanağında ham katkılar ve kaynak kapsamı görünür.

- Resmî Türkçe yama listesi: https://wildrift.leagueoflegends.com/tr-tr/news/tags/patch-notes/
- İstatistik: https://www.wildriftfire.com/stats — dört lig grubu, koridor bazında genel kazanma/seçilme/yasaklanma oranları; örneklem sayısı kaynakta belirtilmemiştir.
- Şampiyon havuzu ve meta: https://www.wildriftfire.com/tier-list
- Rol bazında dizilim, rün, yetenek sırası, karşı seçim ve uyum: her karttaki kaynak rehber.
- Bot/aktif eşya dönüşümü: https://wildrift.leagueoflegends.com/tr-tr/news/game-updates/wild-rift-patch-notes-7-2/

Başlangıç paketi: resmî yama 7.3; istatistik tarihi 22 Eylül 2026. Yama, istatistik ve her rehberin sürümü ayrı saklanır. Kaynakta bir yama etiketi olması, rehberin her önerisinin bağımsız ölçümlerle ispatlandığı anlamına gelmez. Doğrudan eşleşme kazanma yüzdesi uydurulmaz. Meta seviyesi kaynak sıralamasıdır; uygunluk sırası ise açık kurallarla oluşturulur ve kazanma olasılığı değildir.

Meta S+ / S / A / B / C taban ağırlıkları 38 / 32 / 23 / 14 / 7'dir. Güncel genel kazanma oranının etkisi ±5 ile sınırlıdır. Kaynakta doğrudan karşı seçim +23, ters eşleşme −20; ön safa karşı sürekli hasar, koruma, hasar çeşitliliği, giriş ve kaynakta belirtilmiş uyum ayrı katkı sağlar. Bu ağırlıklar kalibre edilmiş maç kazanma modeli değildir. Kod: `modules/wild-rift-engine.mjs`.

Eşyalar şampiyon/rol rehberindeki dizilimden gelir. İlk iki ana eşya ve satın alınmış eşyalar korunur. Kaynağın önerdiği bire bir durumsal değişimler ve yoğun hasara karşı bot tercihleri değerlendirilir. Aynı anda en fazla iki otomatik değişiklik uygulanır. Kaynakta bazı eski şablonlar yedi eşya veriyor: ilk altı eşya korunur, yedinci eşya son yuvanın alternatifi olarak gösterilir. Yedi eşyanın aynı anda alınabileceği iddia edilmez. 7.2 ile gelen aktif eşyalar eski evrensel bot efsunları gibi ele alınmaz. Üçüncü aşama bot geliştirmeleri aynı yuvayı kullanır.

Koridor açıklamaları şampiyon özellikleri ve elle tanımlanmış oyun ilkelerinden üretilir; canlı oyundaki altın, bekleme süresi veya rakibin hareketleri okunmaz. Bölge farkı, lig, eksik seçim ve veri yaşı ekranda açık tutulur. Şampiyon, eşya ve rün adları Türkçeleştirilmiştir; yeni ve henüz çevrilmemiş kaynak girdileri İngilizce açıklama yerine çeviri beklediğini bildirir.

## Güncelleme ve hata davranışı

Güncelleme aşaması ve son on kontrol, veri dosyasının yanında `.wild-rift-status.json` dosyasına yazılır; API yalnızca yöneticiye döndürür. Sunucu yarım işlemden sonra yeniden başlarsa önceki kontrolün yarım kaldığı bildirilir. Hem düğmeyle hem zamanlanmış kontroller aynı durumu günceller. Dosya ve kaynak önbelleği yayın betiği/Docker paketinden çıkarılmıştır.

Kaynak `ETag` veya `Last-Modified` sağlıyorsa koşullu HTTP isteği gönderilir. 304 yanıtında önceki içerik kullanılır; kaynak hatasında eski içerik yeni kontrol yapılmış gibi kabul edilmez. Önbellek varsayılan `.wr-source-cache` dizinindedir; kalıcı disk için `WR_CACHE_DIR` ayarlanabilir. `npm run update:wild-rift:prices` sadece fiyatları günceller; bunu başka bir güncelleme süreci çalışırken başlatma. Dosya deposu tek sunucu örneği/süreç içindir.

### Haricî zamanlayıcı bağlantısı

Sıfıra ölçeklenen servis için `POST /api/wild-rift/scheduled-refresh` uç noktası eklendi. Sunucuda en az 32 karakterli rastgele `WR_SCHEDULER_SECRET` tanımla. Zamanlayıcı HTTPS adresine `Authorization: Bearer SUNUCU_SIRRI` başlığı ile istek gönderir. İşlem bitene kadar isteği açık tutar; zamanlayıcı ve yayın sağlayıcısının süre sınırı birkaç dakikalık kaynak kontrolünü karşılamalıdır. Başarılı cevap yama ve kontrol tarihini, başarısız cevap 503 durumunu taşır. Tekrarlanan yakın kontroller 15 dakikalık aralık kuralını kullanır; eşzamanlı kontroller aynı işte birleşir.

Sır yalnızca sunucu ve zamanlayıcıda tutulur; `site-config.js` veya GitHub Pages'e yazılmaz. Uç noktanın kodunun bulunması bir bulut servisi veya zamanlayıcının kurulduğu anlamına gelmez. Yayın hedefi, kalıcı disk, HTTPS adresi ve zamanlayıcı ayrıca yapılandırılmalıdır. Bu çalışma canlı servise dağıtım yapmadı.

Yalnızca sabit kaynaklardan sunucu tarafında veri alınır; iki eşzamanlı istek ve kısa aralıklarla kaynak yükü sınırlandırılır. İstatistik geçmişinin tamamı tarayıcıya taşınmaz. Şampiyon/rol/istatistik şemaları ve altı eşyalık dizilimler doğrulanır. Yeni dosya geçici dosyada hazırlanır, sonra atomik olarak değiştirilir. Önceki paket `.previous` dosyasında tutulur. Kaynak yapısı bozulursa eski paket korunur. Tekil rehber hataları ilgili rehberi eski tarih ve hata işaretiyle tutar; yaygın hata varsa yeni paket yayımlanmaz. Kaynak veya kullanım şartları değişirse bağlayıcı yeniden değerlendirilmelidir.

Statik veri paketi kamuya açık oyun bilgileri içerir; yönetici sırrı değildir. Yönetici işlemleri API'de korunur. Arayüz kartını gizlemek sunucu güvenliği yerine kullanılmaz.

## Performans düzeltmeleri

- Modül URL'lerinden her açılışta değişen zaman damgası kaldırıldı; sürümlü tarayıcı önbelleği kullanılıyor.
- Wild Rift kodu, stili ve yaklaşık 260 KB veri paketi mod açılana kadar indirilmez. Seçim, sıralama ve eşya hesapları yereldir.
- Dashboard dinleyicileri tekilleştirildi; ekran terk edilince, sekme gizlenince veya oturum kapanınca durduruluyor.
- Aynı çevrim içi durumunun peş peşe yazılması engellendi. Gizli sekmede aktif maç yoksa kalp atışı yazılmıyor.
- Sohbet/özel mesaj sorguları son 100 mesajla sınırlandı. Turnuva sohbetinde önceki dinleyici kapatılıyor, HTML tek seferde oluşturuluyor ve mesaj metni kaçırılıyor.
- Görünmeyen arkadaş ekranı yeniden çizilmiyor; görünmeyen bölümlerin otomatik animasyonları durduruluyor.
- Puan tablosu resim kütüphanesi yalnızca indirme işleminde yükleniyor. Başlangıç betikleri HTML ayrıştırmasını engellemiyor.
- Node sunucusunda sıkıştırma ve statik önbellek eklendi; özel dosya/dizinler servis dışı bırakıldı.
- 2v2 canlı panelindeki tanımsız `d` değişkeni düzeltildi.

Sohbet ekranında şu an en son 100 mesaj gösterilir; daha eski mesajların veritabanındaki kayıtları silinmez.

## Doğrulama

`npm test`: satranç regresyonları ve Wild Rift karar/veri/API testleri.

`npm run test:wild-rift:browser`: seçim, eşya, mobil düzen, taslak saklama, çıkış ve başarısız güncelleme.

`npm run test:site`: gerçek uygulama modülleriyle yönetici kartı, dinleyici ve yazma sayısı kontrolleri. Firebase bu testte taklit edilir; üretim veritabanına yazılmaz.

`npm run test:browser`: gerçek Stockfish WASM ile satranç analiz testi. Tarayıcı testleri Playwright ve Edge gerektirir; `CODEX_NODE_MODULES` kurulu Playwright modüllerinin dizinini gösterebilir.


## Çoklu kaynak doğrulaması

Riot eşya fiyatları ve tarifleri önceliklidir. WildRiftFire temel rol dizilimlerini, WR-META ücretsiz karşı seçim ve uyum kartlarını sağlar. WildRiftCore ve RiftForge eşya fiyat karşılaştırmasına katılır; Core rol seviyeleri ayrıca görünür. Fiyat çelişkisinde resmî doğrulama yoksa kesin alışveriş hesabı durur. Eldeki parçalar resmî tarif ağacında bir kez kullanılır. Eksik tarif kesin bedel üretmez.

RiftGG satırları kaynak tarihiyle gösterilir; yama, lig, rol ve örneklem birlikte doğrulanmadığı için şu an öneri puanına katılmaz. Aynı Çin verisinin farklı sitelerde yayımlanması bağımsız maç örneklemi sayılmaz. LoLegacy açık API sunmadığı için dış uygulama bağlantısıdır. Kilitli/ücretli içerik çekilmez.

Bu kaynaklar uzman kalibrasyonu, canlı hasar simülasyonu veya her şampiyon çiftine özel profesyonel rehber yerine geçmez. Yerel geri bildirimler otomatik olarak dışarı gönderilmez.


23 Eylül yayın kontrolü: Kod GitHub'a gönderildi, Pages kaynağı Actions olarak ayarlandı. GitHub hesabındaki faturalandırma kilidi ilk işin başlamasını engelledi. Kilit giderildikten sonra Actions ekranında **Site yayını (veriler bilgisayardan) → Run workflow** çalıştırılmalı. Canlı güncelleme bu işin başarıyla bitmesine bağlıdır.
