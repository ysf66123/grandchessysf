# Mobil arayüz ve maçtan öğrenme · 1 Ekim 2026

Öneri listesindeki 2–9 numaralı maddeler uygulandı. 1 numaralı yeni ayrıntılı açıklama motoru eklenmedi; mevcut koç açıklamaları korundu.

## Görseldeki sınıflar ve Türkçe adları

Adlar Chess.com'un herkese açık [Türkçe çeviri dosyasındaki](https://www.chess.com/bundles/app/js/client/es6-translations/es6-translation.tr_TR.57845888.js) anahtarlardan 1 Ekim 2026'da doğrulandı. Eski haber yazılarında geçen Parlak/Gaf yerine mevcut çeviri dosyasındaki karşılıklar kullanılır.

| Görseldeki ad | Kullanılan Türkçe ad | Simge |
| --- | --- | --- |
| Brilliant | Harika | Turkuaz daire, !! |
| Great Move | Çok iyi | Mavi daire, ! |
| Best Move | En İyi Hamle | Yeşil daire, yıldız |
| Excellent | Mükemmel | Yeşil daire, başparmak |
| Good | İyi | Açık yeşil daire, onay |
| Book | Kitap | Kahverengi daire, açık kitap |
| Inaccuracy | Yanlışlık | Sarı daire, ?! |
| Mistake | Hata | Turuncu daire, ? |
| Miss | Kaçırılan hamle | Mercan daire, çarpı |
| Blunder | Büyük Hata | Kırmızı daire, ?? |

Simgeler yerel SVG olarak çizilir; ikon yazı tipine veya harici servise bağlı değildir. Tahta rozeti, hamle defteri, kalite özeti, kritik kartlar ve seçili hamle aynı tanımı kullanır. Kalite özetinde sıfır adetli sınıflar da görünür.

## Motor doğruluğu

- Özel etiketler için tam, daraltılmamış konum araması ile aday karşılaştırması ayrı doğrulanır. Bir adayın daraltılmış aramada öne çıkması tek başına “tek güçlü seçenek” kanıtı değildir.
- Çok iyi etiketi, tam aramanın yeterli sayıda alternatifi kapsamasını ve diğer güçlü seçeneklerin gerçekten yeterince zayıf kalmasını gerektirir. Harika etiketi, gerçek feda kanıtına ve fedasız alternatiflerin kazanmış konumu zaten korumuyor olmasına dayanır.
- Kaçırılan hamle için önceki rakip hatası, tamamlanmış ve derin doğrulanmış veriden alınır. Zorunlu hamleler ve rutin taş alımları özel başarı sayılmaz.
- Kararsız kritik kararlar gerektiğinde 24/26/28 derinliğe kadar otomatik yeniden kontrol edilir. Süre sınırına ulaşan veya tutarlılığı sağlanamayan hesaplar tamamlanmış gösterilmez.
- İlk tarama 16, kritik kontrol 20, sınırdaki kararın ilk teyidi 22 hedeflerini ve mevcut doğruluk formülünü korur. Hesaplama modeli Chess.com'un kapalı rating modeli veya CAPS2 formülüyle aynı değildir.
- Tamamlanan hamlelerin ara kayıtları IndexedDB'ye yazılır. Sekme yenilendikten sonra hamle ve FEN geçmişi doğrulanarak eksik incelemeler sürdürülür.

## Maçtan öğrenme

- **Taktik gösterimi:** Yasal motor devamındaki çatal, şaha açmaz, şiş, savunucunun kaldırılması, şah, mat, taş alımı ve terfi izlenebilir. Oklar tahtada gösterilir; oynanan ve en iyi devam ayrı izlenir. Gösterilen devam gerçek maçta oynanan hamleler olarak sunulmaz. Geometrik motifler tehdit göstergesidir, tek başına zorunlu materyal kazancı iddiası değildir.
- **Hata zincirleri:** Aynı tarafın, konum toparlanmadan ardışık değerlendirme kayıpları yaptığı bölümler birlikte sunulur. Grup, kanıtlanmamış bir neden-sonuç açıklaması üretmez.
- **Üç ders:** Öncelikli tekrar, güçlü/görece en iyi karar ve çalışma konusu. Kötü oynanmış bir maçta sırf kartı doldurmak için bir hamleye güçlü denmez.
- **Otomatik antrenman:** Doğrulanmış kritik konumlar kaydedilir. Aşamalı ipuçları ve gerçek motorla güçlü alternatiflerin kabulü vardır. Tamamlanmamış karşılaştırma başarı/başarısızlık olarak kaydedilmez. Başarıdan sonra 1/3/7/14/30 günlük tekrar; başarısızlıkta 10 dakika sonra tekrar.
- **Gelişim:** Son 20 maçın doğruluğu, önceki 20 maçla fark, taktik temaları, evreler ve açılışlardaki kritik kararlar. Taraf değişikliği aynı maçı iki ayrı maç olarak saydırmaz.
- **Açılış ve süre:** Veritabanından ilk çıkış ile ilk gerçek kayıp ayrı gösterilir. Standart PGN `%clk`/`%emt` yorumları ve yeni 1v1/2v2 maçlarının ölçülen saat kayıtları desteklenir. Verisi olmayan eski maçlar için süre tahmini yapılmaz. Saat 30 saniye veya altındayken oluşan kritik kayıplar sayılır; bu ilişki hata nedeni olarak sunulmaz.

Öğrenme geçmişi kullanıcıya ayrı olarak bu cihazın tarayıcısında, en fazla 50 maç ve maç başına 8 antrenman konumuyla tutulur. Hesaplar arasında birleştirilmez; cihazlar arasında senkronize değildir. Depolama hatası motor sonuçlarını değiştirmez. Geçmiş uygulama içinden silinebilir.

## Mobil tasarım

760 piksel ve altında ayrı tasarım uygulanır. Masaüstünün mevcut düzeni korunur; yeni analiz araçları mevcut panellere eklenir.

- Giriş/kayıt, ana menü, hikâye haritası/mağazası/görevi, quiz oluşturma/lobi/oyun/sonuç, 1v1 ve 2v2 lobileri/maçları, solo antrenman, analiz, arkadaşlar/mesajlar, ayarlar, turnuva lobi/sonuçları, deste oluşturucu ve Wild Rift ekranları kapsanır.
- Telefon genişliğine oturan tahtalar, dokunma boyutları, sade kartlar, ekranlara özel sütunlar ve sıkışmayan araç çubukları.
- Genel ekranlarda ana sayfa/arkadaşlar/hikâye/ayarlar alt gezinmesi. Maç ve analiz gibi odak gerektiren ekranlarda mevcut çıkış kontrolleri kullanılır.
- Tema seçimi açılır menüdedir; masaüstüne dönünce asıl tema seçici eski yerine taşınır.
- Mobil analiz dört sekmesini, bütün motor devamlarını, PGN/veri çıktısını ve yeni öğrenme araçlarını korur.
- Diyaloglar ve tam ekran tahtalar güvenli ekran kenarlarını ve doğal kaydırmayı kullanır. Mobil üst çubuk simgeleri için yerel SVG desteği vardır.

## Kontroller

- 272 test geçti; 21 sınıflandırma senaryosu ve taktik/öğrenme/saat regresyonları dahil.
- 67 gerçek maç/özel konumdan oluşan referans paketi; 11 seçili konumda gerçek Stockfish araması, yasal devam, pat ve patı önleyen kale terfisi kontrolü. Bu paket kapalı Chess.com etiketleriyle birebir eşleşme iddiası taşımaz.
- Gerçek Stockfish WASM: mat, taktik okları, ipuçları, kayıtlı antrenman çözümü ve tekrar tarihi, ara kayıt, sayfa yenileme, önbellek, iptal ve PGN çıktısı.
- 21 ekranın tamamında 320/390/740 piksel taşma kontrolü; yedi diyalog, alt gezinme ve masaüstü tema seçicisinin geri dönmesi.
- GitHub Pages statik paketi gerçek uygulama entegrasyon kontrolünden geçti. Firebase test verisi kullanılır; otomatik testler gerçek kullanıcı oyunlarını veya hesaplarını değiştirmez.
