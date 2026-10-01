# Satranç, analiz hızı ve gelişim merkezi — 1 Ekim 2026

Sürüm: `20261001-speed1`. Mevcut masaüstü yerleşimi korunur; yeni araçlar ve isteğe bağlı odak görünümü eklenir.

## Analiz hızı ve doğruluk

- Aynı Stockfish.js 18.0.5 ailesinin çok iş parçacıklı Lite motoru eklendi. Önceki tek iş parçacıklı WASM dosyası, kaynak paketin dosyasıyla SHA-256 olarak birebir eşleşiyor.
- Uyumlu ve izole masaüstü tarayıcılarda iki çekirdek; telefonlarda ve uyumsuz tarayıcılarda tek çekirdek. Çok çekirdekli başlangıç başarısızsa tek çekirdekli sürüme dönüş var.
- Bellek: telefonda 32 MB, bilgisi bulunmayan bilgisayarda 64 MB, en az 8 GB bellek bildiren bilgisayarda 128 MB. Kaynak seçimi derinlik politikasını değiştirmez.
- İlk arama 16, kritik kararlar 20, kararsız kararlar 22–28 derinlik. Üç tam kök adayı ve gerektiğinde oynanan hamleyi de içeren ayrı kök karşılaştırması korunur.
- Kritik konumlar, ilk incelemenin hemen ardından motor belleği sıcakken derinleştirilir. Son aşamada eksik derinlik ve tutarlılık kontrolleri yapılır. Rapor hâlâ gerekli bütün sonuçlar tamamlanmadan açılmaz.
- Aynı geçmiş, derinlik, adaylar, güç ayarı, oturum ve istek kimliğindeki eşzamanlı hesaplamalar tek istekte birleştirilir.
- GitHub Pages için aynı kökendeki servis çalışanı masaüstünde izolasyon başlıkları ve motor dosya önbelleği sağlar. Aktif maç veya analiz sırasında zorunlu yeniden yükleme yapılmaz. Mobil Firebase girişinin dış kimlik çerçeveleri için mobil kullanıcı aracılarında izolasyon uygulanmaz; mobil ve uyumsuz tarayıcı tek çekirdekle devam eder.
- Ana sayfada yalnızca motor başlatılır; canlı maç sırasında arka planda konum çözülmez.
- Bekleme ekranındaki süre aralığı cihazda ölçülen sürelerden oluşur. İlk başta sahte geri sayım verilmez.
- 28 derinlikte sınıra yakın bir karar, aynı derinlikte yeni ve tamamlanan karşılaştırmada kararlıysa doğrulanabilir; kararsız sonuç tamamlandı sayılmaz.

### Ölçümler

`tests/engine-speed.cjs`: aynı üç konumda aynı 18/22 derinlik ve aynı aday sayısı. Tek çekirdek/64 MB toplam 13,483 ms; iki çekirdek/128 MB 7,477 ms; dört çekirdek/128 MB 10,710 ms. Bu cihazda iki çekirdek tercih edildi. Bu yaklaşık %45 motor hesaplama kazancıdır; bütün maçlara uygulanabilecek bir garanti değildir.

`tests/review-speed.cjs`: önceki yayımlanan sürüme karşı, soğuk önbellekle bütün analiz akışı:

| Örnek | Önce | Sonra | Süre azalması |
|---|---:|---:|---:|
| Kısa mat | 14,177 ms | 11,092 ms | %21,8 |
| Açılış ve taktik, 19 yarım hamle | 32,292 ms | 25,937 ms | %19,7 |

Bu örneklerde sonuçlar tamamlandı ve gerekli kararlılık kontrolleri geçti. Bazı konumlar daha yüksek doğrulama derinliğine çıktı. Çok iş parçacıklı seçici arama, aynı derinlikte bile küçük değerlendirme/aday değişiklikleri üretebilir. Sonuçları önceki sürüme zorla eşitlemiyoruz.

Değişen kritik `...g5` değerlendirmesi ayrıca resmî yerel Stockfish 18 Full ile tam kök ve aday karşılaştırmasında 24 derinlikte kontrol edildi: 177 CP kayıp, yaklaşık 0,1555 dönüştürülmüş kayıp. Bu referans Hata bandındadır. Derinlik sayısını tek başına kalite kanıtı saymıyoruz.

Ölçüm çıktıları: `.cache/engine-speed.json`, `.cache/review-speed.json`, `.cache/strong-reference.json`. Önceki `cd17273` sürümü karşılaştırma için `.cache/speed-baseline` içinde saklandı. Bunlar test kayıtlarıdır, genel hız garantisi değildir.

## Canlı maçlar

- 1v1, 2v2 ve tam ekranda son hamlenin çıkış karesi açık sarı `#fff0a3`, varış karesi daha koyu sarı `#dfbd45`.
- İşaretler PGN hamle geçmişinden okunur; tahta yönü, rok, terfi, izleyici ve yeniden çizimler desteklenir.
- Rakip sırasında kendi taşına ve hedefe dokunarak ön hamle hazırlanabilir. Esc veya İptal ile silinir. Terfi taşı seçilebilir.
- Gerçek sıra geldiğinde hamle yeniden yasal hamleler arasında aranır. Oda/hesap değişimi, eski hamle veya değişen 2v2 oyuncu sırası korunur; geçersiz ön hamle oynanmaz.
- Hamle kaydı Firestore işlemiyle son konum, hamle sayısı, maç durumu ve sıradaki oyuncuyla karşılaştırılır. Çakışmada güncel konum geri yüklenir. Bu, sunucuda satranç kurallarını uygulayan yeni bir hile önleme servisi değildir.
- Botlar için Dengeli, Saldırgan, Savunmacı, Konumsal tarzlar. Farklı tarzlar aynı zorluk ayarındaki sınırlı değerlendirme aralığındaki yasal motor adayları arasında tercih yapar; analiz motorunun gücü düşmez.

## Gelişim merkezi

- Ana sayfadan ulaşılır: Açılış repertuvarı, Oyun sonu akademisi, Kişisel gelişim.
- Repertuvar kişisel PGN'lerden, tarafları ayrı tutarak oluşur. Sıklık, örnek sayısı ve varsa tamamlanan analiz ölçümleri görünür. Motor adayı varsa tekrar hedefi o hamledir; veri yokken tarihsel devam iyi hamle diye sunulmaz.
- Beş oyun sonu: vezirle mat, kaleyle mat, geçer piyon, muhalefet/beraberlik, patı önleyen kale terfisi. Beş başlangıç hedefi gerçek Syzygy servisiyle doğrulandı. Kullanıcı oyunu sonuca kadar oynar; terfi seçimi, yeniden başlatma ve kaynak durumları görünür.
- Syzygy alınamazsa rakip Stockfish 22 derinlikte yanıtlar; kaynak veya doğrulama eksikliği gizlenmez.
- Gerçek analiz kayıtlarından genel/açılış/oyun ortası/oyun sonu grafikleri. Süre türleri ayrı filtrelenir; bilinmeyen süre uydurulmaz. Eksik evreler grafikte boşluk bırakır.
- Öğrenme kayıtları cihazda son 50 maç; Firebase hesabında en fazla son 35 maç ve 480 KB UTF-8 bütçesi. Son alıştırma girişimleri birleştirilir, odak geri geldiğinde yeniden eşitlenir. Geçmiş silme işareti cihazlar arasında korunur.
- Canlı hesapta profil yazma kuralları bu alanı engellerse yerel kayıtlar korunur ve arayüz eşitlemenin kullanılamadığını açıkça gösterir. Hesapla gerçek bulut eşitlemesi bu oturumda kullanıcı kimliğiyle doğrulanmadı; birleştirme ve erişim hatası davranışı test edildi.

## Tasarım ve kullanım

- İsteğe bağlı odak görünümü, yarım hamle numarasına gitme, tahta altı kontrollerde sağa/sola kaydırma.
- Mobilde Adaylar/Çalış/Dışa aktar alt paneli. Gerçek aday paneli taşınır; kapanınca geri yerleştirilir, mükerrer kimlikler oluşmaz.
- Büyük yazı, güçlü kontrast ve azaltılmış animasyon tercihleri. Sınıflandırma simgelerinin renk/şekilleri korunur. Tarayıcı yakınlaştırması açıldı.
- Yeni merkez klavye ile oynanabilir kareler ve anlamlı etiketler içerir. Taş görseli yüklenemezse yerel Unicode taş yedeği görünür.
- Açılış terimleri görüntüleme katmanında Türkçeleştirilir; kaynak adları ve veri anahtarları değişmez.

## İsteğe bağlı yerel motor

Bu bilgisayarda resmî Stockfish 18 AVX2 indirildi ve gerçek motor bağlantısı tarayıcıda test edildi. `SATRANC-YEREL-MOTOR.bat` yardımcısını başlatıp Ayarlar → Okunabilirlik ve analiz motoru → Bilgisayarımdaki Stockfish seçilir. Her hamlede ayar yapmak gerekmez. Bilgisayar yeniden başladıktan sonra yardımcı yeniden başlatılır. Tarayıcı yerel ağ erişim izni isterse bu bağlantı için izin gereklidir.

Yardımcı yalnızca `127.0.0.1:8766` üzerinde çalışır; izinli kökenler, sınırlı UCI komutları, bellek/çekirdek sınırları, iki oturum ve boş oturum temizliği vardır. Keyfî kabuk, dosya yolu veya sınırsız arama komutları kabul edilmez. Bağlantı yoksa tarayıcı motoruna dönülür. Full/Lite sonuçları aynı önbelleğe karıştırılmaz. Yerel motor ikilileri genel siteye yüklenmez.

## Doğrulama

- Birim testleri, gerçek WASM incelemesi, 67 referans konumu ve 11 gerçek Stockfish probu.
- 22 mobil ekran: 320/390/740 genişlikleri; mevcut diyaloglar, gezinme ve masaüstü tema yerleşimi.
- Yeni araçların gerçek tarayıcı testi: iki canlı modun renkleri/ön hamlesi/yasallığı/tam ekranı; çok çekirdekli tamamlanan inceleme; odak; alt panelin geri yerleşimi; repertuvar; Syzygy terfi/pat örneği; gelişim grafiği; okunabilirlik; resmî yerel motorun gerçek bağlantısı.
- Kaynak ve GPL lisansı: `vendor/stockfish-SOURCES.txt`, `vendor/stockfish-GPLv3.txt`.
