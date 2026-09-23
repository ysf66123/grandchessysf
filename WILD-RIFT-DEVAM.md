# Wild Rift geliştirme devam notu — 23 Eylül 2026

Kullanıcı, beş saatlik kullanım payı %1'e yaklaşana kadar özellik eklenmesini ve kalanların kullanım yenilenince tamamlanmasını istedi. Bu dosya kaldığımız yeri korur; otomatik devam görevi kurulmadı.

## Tamamlanan paket

- Mevcut admin erişimi ve Türkçe mod korundu; `20260923-wr2` varlık sürümü.
- Kaynak/tarih/yama kalitesi; çelişkili karşı seçimleri puandan çıkarma; kendi şampiyonunun takım uyumuna yanlış katılmasını düzeltme.
- Koridoru belirsiz rakipler için yasal yerleşimler, ihtiyatlı eşleşme hesabı; koridor taşıma ve yer değiştirme.
- İlk üç aday, dört sıralama önceliği, tecrübe, üçlü karşılaştırma, açık katkılar.
- Geri/ileri alma, sekiz yerel kayıt, hesap ayrımı, 50 yerel geri bildirim ve dışa aktarma.
- Kaynak eşya alternatifini elle seçme; çekirdek/satın alma/çakışma koruması; aynı roldeki alternatif rehberleri seçme.
- Altın ve eldeki eşya girişi; yama/tarih kontrollü tam eşya fiyatları. Kaynakta tarif olmadığı için bileşen indirimi uygulanmıyor.
- Rakip eşya girişi ve doğrulanmış kritik/zırh/büyü direnci sinyalleri. Normal saldırı etiketi kritik eşyası varsayımı üretmiyor.
- Şampiyon ilkeleri, erken koridor ve ikiye iki partner planı; bunlar kural tabanlı, kapsamlı çift rehberi değil.
- Kalıcı güncelleme durum/geçmişi; sunucu sırrıyla dış zamanlayıcı uç noktası; koşullu kaynak istekleri; önbellek/durum dosyalarının yayın dışında tutulması.
- Ölçümlenen ekran hazırlama süreleri, kaynak istekleri/aktarım; aynı taslak için tekrar yerel depolama yazmama.
- Canlı kaynak kontrolü: 141 şampiyon, 179 kaynak dizilimi, 116 eşya; 96 güncel eşya fiyatı. Resmî yama 7.3; istatistik kaynağının tarihi 2026-09-22, Çin sunucusu. İstatistik tarihinin kontrol tarihinden farklı olması normal.

## Sonraki oturumun öncelikleri

1. **Yayın altyapısı:** Canlıya gönderilmedi. `site-config.js` API adresi boş. Node/Docker sunucu hedefi ve hesap erişimi henüz belirlenmedi; kalıcı disk, HTTPS, zamanlayıcı ve yöneticiyle canlı uçtan uca doğrulama gerekiyor. Mevcut tek süreç dosya deposu birden fazla sunucu örneği için uygun değil.
2. **Bağımsız veri ve eşya tarifleri:** Tek topluluk kaynağına bağımlılık sürüyor. Resmî verilerle lisans/erişim koşullarına uygun ikinci doğrulama, tam tarif/yükseltme/aile kataloğu gerekli. PC League of Legends verilerini Wild Rift verisi gibi kullanma. Kaynakta yedi yuvalı rehberler hâlâ var; arayüz uyarıyor, bağımsız düzeltme henüz yok.
3. **Sıralama kalibrasyonu:** Ağırlıklar açıklanabilir ama uzman onaylı bir değerlendirme kümesiyle kalibre edilmiş değil. Gerçek uzman değerlendirmeleri/izinli maç verisi topla; referans yöntemle karşılaştır. Mevcut mekanik testlerin geçmesini oyun performansının kanıtı olarak sunma. Kaynak örneklem sayısı vermediği için eşleşme kazanma yüzdesi/güven aralığı üretme.
4. **Gerçek eşya optimizasyonu:** Doğrulanmış tarifler, tamamlanma bedeli, güçlenme zamanı, oyun süresi/seviye, eşya etkileri ve rakibin anlık dizilimiyle seçenek karşılaştırması. Şimdiki rakip eşya girdisi yalnızca birkaç doğrulanmış tehdidi etkiliyor; hasar simülatörü değil.
5. **Uzman eşleşme kütüphanesi:** Şampiyon çiftleri ve nişancı-destek ikilileri için kaynaklı, yamaya bağlı takas/dalga/güçlenme pencereleri. Mevcut genel ilkeleri tüm çiftlere özel rehber diye sunma. Kayn biçimleri gibi varyantlar için güvenilir Türkçe ad ve mekanik ayrımı ekle.
6. **Ölçülen site performansı:** Gerçek düşük donanımlı telefonlarda ana iş parçacığı, ilk açılış ve Firestore okuma/yazma takibi. Bildirim/turnuva geçmişine indeksleriyle birlikte sayfalama; diğer ağır modülleri ihtiyaç anında yükleme. Mevcut panel ölçümü yalnızca yerel ekran hazırlama süresidir.
7. **Geri bildirim inceleme:** Yerel kayıtları yönetici değerlendirme sürecine bağlama; veri koruma/retention ve kullanıcı onayı tasarımı. Otomatik gönderim eklenmedi.

## Doğrulama ve çalışma

Son paket: 62 otomatik test; Wild Rift tarayıcı akışı ve gerçek site modülleriyle entegrasyon kontrolü. Kaynak kapsamı daralması, eski yamaya geri dönme, 304 önbellek yanıtı ve kaynak hatasında eski paketin korunması ayrıca sınanır. Veri dosyası 286.569 bayt, gzip ile 35.709 bayt ölçüldü. Canlı kaynak yenilemesi başarılı; fiyat kontrolünde eksik istek kalmadı.

`npm test`, `npm run test:wild-rift:browser`, `npm run test:site`.

`npm start` yerel sunucu; kaynakları istemeden tekrar taratmamak için denemelerde `WR_AUTO_UPDATE=false`.

`npm run update:wild-rift` tam kontrol; `npm run update:wild-rift:prices` sadece fiyatlar. Aynı dosyayı yazan iki ayrı komutu eşzamanlı çalıştırma.

Tarayıcı testi Edge/Playwright kullanır ve Firebase'i taklit eder; üretim veritabanına yazmaz. Stockfish kodu bu pakette değiştirilmedi; birim regresyonları `npm test` içinde çalışır. Paket yeni fiyatlarla hâlâ küçüktür ve mod açılana kadar indirilmez.
