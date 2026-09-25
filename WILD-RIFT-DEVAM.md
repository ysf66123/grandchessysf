## Üçüncü kaynak tam şampiyon kapsamı — 25 Eylül 2026

`20260925-counters2`: WildRiftCore 142/142 şampiyon sayfası doğrulandı. 591 karşı seçim, 227 beceri eşleşmesi ve 428 sinerji: toplam 1.246 kayıt. Eksik şampiyon yok; her olası rol/şampiyon çifti için veri olduğu iddia edilmez. Kaynak dizini kanonik adresleri sağlar (Kai’Sa, Cho’Gath, Nunu & Willump vb.). sup/bot etiketleri ve şampiyon kimliği takma adları çözüldü. Tek rollü şampiyonda partnerin rolünü taşıyan sinerji kartları öznenin rolüne normalleştirildi. Ayrıştırma hatası üç kez olunca tüm kaynağı durduran yanlış sınıflandırma düzeltildi; gerçek 403/429 ve ardışık bağlantı hatalarında bekleme korunuyor. Eski v1 ayrıştırıcı kaynaklı yanlış bekleme, v2 göçünde kaldırıldı.

Tam tarama altı saatlik taze sayfaları yeniden indirmez, tek işçi ve 1,5 saniye aralık kullanır. 48 sayfa sınırı kaldırıldı. Arayüzde güncel doğrulanmış şampiyon kapsamı gösteriliyor. 127 test ve mobil tarayıcı kontrolleri geçti; gzip veri yaklaşık 117 KB. Yayın doğrulaması sonrasında yerel not eklenecek.

## Karşı seçim güncellemesi — 25 Eylül 2026

Onaylı paket uygulandı; varlık sürümü `20260925-counters1`. Yön/rol/yama kontrollü karşı seçim, açık kaynak güç derecesi, beceriye bağlı eşleşme, kaynak grubu başına sınırlı oy, çelişkide sınırlı katkı ve ayrı kontrol/içerik tarihi eklendi. Meta puan aralığı daraltıldı; kör/flex seçimlerde bilinmeyen durum güvenli kabul edilmez. Genel Çin kazanma oranları rakibe özel oran değildir.

Core ilk 48 sayfa kontrolünde 42 şampiyondan 303 kayıt: 165 karşı seçim, 65 beceri eşleşmesi, 73 sinerji. Devam kontrolü üç başarısız yanıttan sonra bir saat beklemeye geçti; bu nedenle tüm 142 şampiyonda üçüncü kaynak kapsamı iddia edilmez. Eski kayıtlar özgün tarihleriyle korunur. 108 önbellek WR-META rehberi tekrar ayrıştırıldı; 938 ilişkiye gerçek içerik tarihi eklendi, indirme tarihleri yenilenmedi. Core kaydında olumlu eşleşme ters yönde doğru normalize edilir; kaynak sahipliği ayrıca saklanır.

İkiye iki değerlendirmede kendi partneri, rakip ikili, kaynak sinerjisi ve partnerin kendi eşleşmesi kullanılır. Eksik/flex ikilide katkı yok. Mekanik kurallar sınırlı ve 7.3 yamalıdır; yeni yamada yeniden inceleme olmadan uygulanmaz. Tam yetenek/dalga simülasyonu ve uzman etiketli kazanma modeli değildir. Türkçe kartlarda katkılar, kaynak bağlantısı/tarihleri, çelişki, kapsam ve genel oyun aşaması ilkeleri gösterilir.

123 birim/HTTP testi (120 yeni karşı seçim senaryosu dahil), genişletilmiş 360 px tarayıcı testi ve gerçek statik uygulama entegrasyonu geçti. Yerel 200 hesap ölçümü: medyan 1,8 ms, p95 3,33 ms; gerçek telefon ölçümü değildir. Gzip veri yaklaşık 107 KB. Seçimlerde veri isteği yok. Canlı yayın doğrulandı: commit `393ec5ce93a169f919559ca5ba3f783f147950ac`, Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36127794766 başarılı. Canlı index, app-v2, karşı seçim motoru/UI, ana motor ve JSON SHA-256 karşılaştırmaları yerelle eşleşti. Bu yayın doğrulama cümlesi yerel devam notudur.

Önceki eşya güncellemesi 8964bd6 için Pages işi 36048759044 başarıyla tamamlanmıştı. Aşağıdaki eski bölümler tarihsel kayıttır; 23 Eylül faturalandırma engeli, mevcut standart Pages yayın yolunun durumu değildir.

## İkinci eşya sistemi — 24 Eylül 2026

Kullanıcının onayladığı plan uygulandı. Varlık sürümü `20260924-items2`. Pozitif Wild Rift eşya kimliği, resmî kaldırılma üstünlüğü, parça/tam eşya ayrımı, aile çakışması kontrolü; şampiyon dizilim uyumu ve etki uygulama koşulları; can/direnç/seviye sinyalleri; hedefli takım görevleri; esnek üç değişiklik seçeneği; kaynakların ayrı tam dizilimleri; karar belirsizliği ve değişiklik açıklaması; alışveriş sırası/yuva/parça/birikim dönüşümü kontrolleri eklendi.

Paket: 142 şampiyonun temel nitelikleri, 103 Fire eşya taraması, 181 ana rol dizilimi, 222 ek Core dizilimi. Katalogda 160 kayıt var; 150 doğrulanmış kullanılabilir eşya/parça, 3 kaldırılmış, 7 doğrulanamadığı için önerilmeyen kayıt. Core 429 verdi; istekler durduruldu, 108 şampiyonun son ek kaynak kontrolü başarısız/ertelenmiş olarak kayıtlı. Önceki geçerli dizilimler kendi zamanlarıyla korundu. Sonraki taramalar altı saatlik önbelleğe ve bir saatlik bekleme süresine uyar. Bu sayılar tüm oyunun eksiksiz kataloğu veya 222 bağımsız uzman onayı anlamına gelmez.

110 birim/HTTP testi geçti; bunlardan biri 162 rol/kompozisyon/aşama senaryosunu kapsıyor. Önceki yayımlı motorla aynı veri üzerinde 102 senaryo karşılaştırıldı: 8 sonuç değişti, yeni 102 sonuç da eşya geçerlilik kontrolünden geçti. Karşılaştırma `.wr-source-cache/item-upgrade/evaluation.json` içinde; uzman etiketli kalite veya kazanma ölçümü değildir. Genişletilmiş tarayıcı ve gerçek statik site entegrasyonu geçti. Paket gzip 103 KB. Yayın sonucu tamamlandıktan sonra aşağıya kaydedilecek.

## Önceki eşya motoru güncellemesi — 24 Eylül 2026

Canlı doğrulama tamamlandı: `eb80f5dc014bdd5dfced8c0dd363b7b4bc0dddca`, standart Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/35924579719 başarılı. Canlı index, üç yeni modül, Wild Rift UI ve veri JSON içerikleri yerel dosyalarla SHA-256 üzerinden (satır sonları normalize edilerek) eşleşti. Veri localRevisionAt: `2026-09-23T21:40:39.64Z`. 181 dizilimin yerel hesap süresi toplam 26 ms, en yavaş 2,56 ms; gerçek telefon performans ölçümü değildir. Yayın doğrulamasından sonraki bu paragraf yerel devam notudur.

Yeni `wild-rift-build-planner.mjs`, `wild-rift-item-rules.mjs`, `wild-rift-build-ui.mjs`: koridor/takım savaşı aşaması, hayatta kalma/hasar önceliği, takım karşı eşya kapsamı, gözlenen rakip nitelikleri ve etkileri. En fazla iki otomatik değişiklik; ilk iki ana eşya ve satın almalar korunur. Aynı yuva alternatifleri sınırlı kombinasyon aramasıyla değerlendirilir. Türkçe gerekçe, ödünleşim, karşılanamayan ihtiyaç, altı yuvalı karşılaştırma ve eşya niteliği ayrıntıları var.

98/98 Fire eşya nitelik/etki/fiyat kontrolü başarılı, yama 7.3. Etki ve niteliklerin ayrı yama/zaman damgaları var; resmî istatistikler öncelikli. Fiyat güncelleme komutu karşılaştırma panelindeki Fire gözlemlerini de günceller. Mevcut doğrulanmış parça etkisi yoksa erken antiheal parçası gösterilmez. Sınırsız hasar optimizasyonu veya uzman kalibrasyonu iddiası yoktur.

88 birim/HTTP testi, genişletilmiş Wild Rift tarayıcı testi ve statik paket üzerinde gerçek site entegrasyonu geçti. 360 piksel mobil kontrol, sıfır seçim veri isteği, admin/çıkış kontrolleri geçti. Varlık sürümü `20260924-items1`. Aşağıdaki yayın kaydı önceki sürüme aittir; yeni yayının canlı sonucu ayrıca doğrulanır.

## Önceki canlı doğrulama — 24 Eylül 2026

Standart Pages yayını başarılı: https://github.com/ysf66123/grandchessysf/actions/runs/35919861282 (20ca09d). Canlı JSON indirildi ve yerel paketle eşleşen `localRevisionAt=2026-09-23T20:59:57.963Z`, 142 şampiyon doğrulandı. Yalnız veri dosyasını gönderen 245d105 commit’inin Pages işi de başarılı. Özel Actions faturalandırma hatası artık bu yayın yolunu engellemiyor; eski kırmızı işler tarihsel kayıttır.

İlk tek seferlik yerel tarama/gönderim tamamlandı. Kalıcı gizli süreç veya Windows başlangıç görevi kurulmadı. Kullanıcı `VERI-GUNCELLEME-BASLAT.bat` dosyasını açıp pencereyi açık tutmalıdır; mevcut yerel sunucunun güncellemeleri de otomatik gönderir.

# Güncel karar: bilgisayarda tarama, GitHub üzerinde yayın

Kullanıcının son isteği uygulandı: GitHub özel Actions iş akışı kaldırıldı. Yayın standart Pages `main / (root)` üzerinden yapılır. Yerel tam/fiyat/ek kaynak güncellemeleri, başarılı doğrulamadan sonra yalnızca veri JSON dosyasını GitHub Contents API üzerinden gönderir. Mevcut Git Credential Manager kullanılır. SHA/yama/zaman denetimi, işlem kilidi, aynı veriyi atlama ve beş dakikalık başarısız gönderim yeniden denemesi eklendi. Yerel `.wr-local-sync.json` yayına girmez.

`VERI-GUNCELLEME-BASLAT.bat` açık bırakılırsa altı saatlik otomatik tarama; `VERI-SIMDI-GUNCELLE.bat` anlık tarama. İşletim sistemi başlangıç görevi kurulmadı. Ayrıntılar WILD-RIFT-KURULUM.md içinde. 74 otomatik test ve tarayıcı regresyonu geçti.

Özel Actions kilide takılırken standart Pages işinin başarıyla çalışabildiği API geçmişinden doğrulandı. Son yayın sonucu ayrıca kontrol edilmelidir. GitHub’a gönderimi canlı yayının başarısı diye raporlama.

Gerçek yerel tarama tamamlandı: 142 şampiyon, 181 rol rehberi, yama 7.3, ana rehber hatası yok. Verinin tek başına otomatik GitHub gönderimi `245d10556d53d0e61e0f1d700aae0f763b45adfd` commit’iyle doğrulandı. Hwei artık ana kaynak kataloğunda bulundu; aşağıdaki eski oturum notlarındaki eksik Hwei bilgisi güncelliğini yitirmiştir. Otomatik güncelleyici Windows başlangıcına eklenmedi; başlatma dosyası açık tutulur.

---

# Wild Rift durum notu — 23 Eylül 2026

## Bu oturumdaki çalışma

Kullanıcı ayrı sunucu olmadığını belirtti ve GitHub Pages ile ilerlemeyi seçti. Admin arayüzü korundu. Önceki oturumun taslak, karşı seçim, koçluk, performans ve Stockfish iyileştirmeleri korunuyor.

- Resmî Riot 7.3: 59 eşya değişikliği, 50 doğrulanmış tarif; parça indirimi, tekrar kullanımı önleme, fiyat çelişkisi ve kaldırılan eşyalar.
- WildRiftFire: temel 141 şampiyon / 179 rol dizilimi ve lig bazlı Çin istatistikleri.
- WR-META: ücretsiz kartlardan 1.031 karşı seçim/uyum ilişkisi. Kilitli içerik alınmaz. Son taramada 8 sayfa ayrıştırılamadı; panelde görünür.
- WildRiftCore: 113 eşya karşılaştırması, 141 eşleşen şampiyon, tarihli meta görünümü. Ligi belirsiz istatistikler öneri puanına eklenmez.
- RiftForge: 120 herkese açık eşya fiyatı. Kişisel AI servisi kullanılmaz.
- RiftGG: 19.380 kaynak satırının tarihi Nisan 2026. Yalnızca sınırlı tarihsel örnekler taşınır; güncel puana katılmaz. 3 sayfa başarısız.
- LoLegacy: resmî uygulama bağlantısı; açık API doğrulanamadığından otomatik entegrasyon iddiası yok.
- Türkçe kaynak paneli, fiyat kanıtları, rol/meta karşılaştırması. Toplam 151 eşya/parça. Paket gzip yaklaşık 77 KB; mod açılana kadar yüklenmez.
- GitHub Actions ile altı saatte bir kontrol, workflow_dispatch ile elle tarama, doğrulama sonrası veri commit ve Pages dağıtımı. Statik düğme yayımlanan son paketi alır; olmayan API'ye Firebase token göndermez.
- Yayın dosyaları açık listeyle hazırlanır; araştırma önbelleği, kimlik bilgileri, sunucu ve eski paketler Pages çıktısına girmez.

## Doğrulama

68 birim/HTTP testi geçti. Tarayıcıda mobil, admin erişimi, karşı seçim, alışveriş, kaynak karşılaştırma, statik yenilemede sıfır API isteği, çıkış ve hesap ayrımı test edildi. Gerçek site modülleriyle entegrasyon testi geçti. Bunlar oyun performansını kanıtlayan uzman değerlendirmeleri değildir.

Komutlar: `npm test`, `npm run test:wild-rift:browser`, `npm run test:site`.
Kaynak taraması: `npm run update:wild-rift`. Fiyat-only komutu tam kaynak taramasının yerine geçmez. Aynı dosyayı yazan iki güncelleme eşzamanlı çalıştırılmaz.

## Dış veri gerektiren sınırlar

- Uzman etiketli değerlendirme kümesi ve gerçek maç doğrulaması olmadan ağırlıklar kalibre edilmiş kazanma modeli sayılamaz.
- Tüm şampiyon çiftleri için kaynaklı ayrıntılı takas/dalga rehberi ve oyun içi hasar simülasyonu tamamlanmış değil; mevcut koçluk açıklanabilir genel mekanik kurallardır.
- Core yeni Hwei verisi gösteriyor, fakat ana rehber kataloğunda henüz yok; doğrulanmış rol dizilimi olmadan uydurma öneri eklenmedi.
- Firestore bildirim/turnuva geçmişi sayfalaması ve gerçek düşük donanımlı telefon ölçümleri hâlâ ayrıca ele alınmalı. Mevcut dinleyici ve tekrar istek azaltmaları korunuyor.
- Geri bildirim cihazda kalır; dışarı otomatik gönderim veya uzman incelemesi yok.

Yayın sonucu son kullanıcı mesajında ve GitHub Actions geçmişinde doğrulanır.

## Canlı yayın engeli

Kod `28ccf78` commit'iyle GitHub main dalına gönderildi. Pages yayın kaynağı başarıyla `workflow` yapıldı. İlk yayın işi: https://github.com/ysf66123/grandchessysf/actions/runs/35859364706

GitHub iş açıklaması: “The job was not started because your account is locked due to a billing issue.” Bu hesap kilidi çözülmeden Actions dağıtımı ve zamanlanmış tarama çalışmaz. Kullanıcının GitHub faturalandırma engelini çözmesi gerekir; ödeme veya hesap ayarı değiştirilmedi. Engel kalkınca Actions → Site yayını ve Wild Rift verileri → Run workflow ile tarama ve yayın birlikte başlatılır. Eski canlı yayının güncellendiği iddia edilmemelidir.
