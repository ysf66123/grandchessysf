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
