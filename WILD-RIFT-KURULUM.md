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

GitHub Pages, Node sunucusunu çalıştırmaz. Gönderilen veri paketiyle seçim asistanı açılır, fakat **kaynakları düğmeyle yenilemek ve zamanlanmış güncellemeler** için veri servisini ayrıca yayınlamak gerekir. Bu çalışma buluta servis dağıtmadı ve mevcut canlı siteye dosya göndermedi.

Dockerfile veya Node destekleyen bir servis kullanarak `server.js` çalıştır:

1. `FIREBASE_PROJECT_ID=chess-14580` ayarla.
2. Gerekiyorsa `WR_ADMIN_UIDS` tanımla; özel yetkiyle çalışan hesaplarda bu zorunlu değil.
3. `WR_ALLOWED_ORIGINS=https://ysf66123.github.io` ayarla. Özel alan adı kullanıyorsan onun kökenini de ekle.
4. Servisin HTTPS adresini `site-config.js` içindeki `WILD_RIFT_API_BASE` değerine yaz. Adresin sonuna `/api/wild-rift` ekleme.
5. Kalıcı depolama kullanıyorsan `WR_DATA_FILE` ile JSON dosyasının yolunu belirt. İlk çalışmada paket bu dizinde yoksa güncelleme oluşturur. Birden fazla sunucu örneği kullanmadan önce ortak depolama ve dağıtık kilit gerekir; mevcut servis tek örnek için tasarlanmıştır.
6. Node sunucusunun devamlı çalışması gerekir. Sıfıra ölçeklenen bir servis seçilirse altı saatlik kontrol için ayrıca zamanlayıcı kurulmalıdır.

Firebase özel anahtarları tarayıcıya veya GitHub Pages'e konulmaz. Token imzasını doğrulamak için proje ID'si yeterlidir; yönetici yetkisi atayan komut ise proje kimlik bilgileri ister. `.env.example` örnektir; ortam değişkenlerini servis ayarlarından ver. Yerel Node 22+ için `node --env-file=.env server.js` kullanılabilir.

## Veri ve karar yöntemi

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
