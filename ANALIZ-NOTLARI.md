# Maç analizi — 23 Eylül 2026

Aktif uygulama `app-v2.js` üzerinden `modules/analysis-v2.js` yükler. Eski `analysis.js` etkin giriş noktası değildir.

## Yapı

- `analysis-engine.mjs`: Paylaşılan Stockfish iş kuyruğu, UCI protokolü, zaman sınırı, iptal ve yeniden başlatma. Botların güç ayarlarını korur. MultiPV sonuçlarını aynı tamamlanmış derinlikten alır; bound skorları kesin puan gibi kullanmaz.
- `analysis-core.mjs`: Skor yönü, WDL/beklenen puan, sınıflandırma, doğruluk, yasal PV oynatımı ve temkinli feda tespiti. Arayüzden bağımsız test edilir.
- `analysis-data.mjs`: Yerel açılış konumları, isteğe bağlı Syzygy servisi ve motor devamına dayalı açıklamalar.
- `analysis-v2.js`: PGN geçmişi, kademeli rapor, görselleştirme, devam denemeleri, kritik hamle gezinmesi, yeniden çözme ve paylaşma entegrasyonu.

## Hesaplama

İlk tur derinlik 16 ve 3 saniyelik arama bütçesi kullanır. Kritik veya tamamlanmamış konumlar derinlik 20 ve 8 saniyelik bütçeyle yeniden incelenir. Eşik çevresindeki veya değişen kararlar derinlik 22 ve 12 saniyelik bütçeyle doğrulanır. Kullanıcı seçili hamlede daha derin inceleme istediğinde mevcut derinliğe iki eklenir; hedef en az 22, en fazla 28 olur. 24 ve üzeri hedefler için arama bütçesi 18 saniyedir. Her arama gerçek derinliğiyle raporlanır; cihazın hızına bağlı olarak hedefe ulaşamayabilir.

En iyi ve oynanan hamle aynı kök konumdan değerlendirilir. Oynanan hamle ilk MultiPV sonuçlarında yoksa ilk adaylarla birlikte `searchmoves` üzerinden yeniden karşılaştırılır. Motor konuma yalnızca FEN ile değil, başlangıç FEN'i ve hamle geçmişiyle ulaşır. Farklı kaynaklı Lichess bulut CP skorlarının yerel sonuçlarla karıştırılması kaldırılmıştır.

Sınıflandırma ve doğruluk yalnızca Stockfish CP/mat çıktısına dayanır. Motorun WDL çıktısı JSON raporunda denetim amacıyla korunur; doğrudan hamle notuna çevrilmez. CP puanı Lichess’in yayımladığı dönüşümle 0–1 ölçeğine aktarılır: `1 / (1 + exp(-0.00368208 × cp))`. CP dönüşümünde -1000/+1000 sınırı uygulanır; mat ayrı değerlendirilir.

Kayıp en iyi ve oynanan hamlenin dönüştürülmüş değerleri arasındaki negatif olmayan farktır. Hamle doğruluğu, kayıp yüzde puana çevrilerek `103.1668 × exp(-0.04354 × kayıp_yüzde_puan) - 3.1669` formülünden hesaplanır ve 0–100 aralığında tutulur. Motorun seçtiği hamle 100 alır. Oyun doğruluğu, değişkenliğe göre ağırlıklı ortalama ve harmonik ortalamanın ortalamasıdır. Etiketler yüzdelere müdahale etmez. Yayımlanmış Lichess yöntemine dayanan bir uyarlamadır; aynı-kök hamle karşılaştırması ve hareketli pencere uygulaması nedeniyle birebir Lichess/CAPS2 sonucu vaat etmez. Kaynak: https://lichess.org/page/accuracy

“En iyi” etiketi (zorunlu tek yasal hamle dışında) yalnızca motorun birinci tercihiyle aynı UCI hamlesine verilir. Eşit WDL veya doygun puanlar, farklı hamleleri “En iyi” yapmaz. Özel etiketlerden sonra kayıp eşikleri: %2 altı harika, %5 altı iyi, %10 altı hassas değil, %20 altı hata, %20 ve üstü büyük hata. Zaten kayıp bir konumda mata girme otomatik büyük hata değildir; daha uzun ama hâlâ zorunlu bir matla kazanma da doğruluğu düşürmez. Mat geçişlerinde sahte CP kaybı üretilmez.

Her hamlenin ham CP/mat çıktısı, WDL verisi, devam yolları, gerçek derinliği ve sınıflandırması “Motor verisini indir” düğmesiyle JSON olarak alınabilir. Ekranda en iyi ve oynanan hamlenin puanları birlikte gösterilir. Süre sınırındaki veya derinleşirken değişken kalan kararlar geçici olarak işaretlenir. Çok kısa maçların yüzdesi yalnızca gösterilen hamle sayısını temsil eder.

Feda etiketi, derin arama tamamlandığında, önerilen devamda oynanan taşın gerçekten alınması ve hemen geri alınamayan materyal açığının sürmesi gibi temkinli koşullara dayanır. Tüm stratejik fedaları saptama iddiası yoktur. Tek yasal hamle bulunması tek başına “Kritik Hamle” etiketi üretmez. Rutin olarak kendisinden en az aynı değerdeki bir taşı almak da yalnızca alternatiflerden güçlü olduğu için bu özel etiketi almaz.

Mat, beraberlik ve tekrar geçmişi ayrıca ele alınır. Syzygy sonucu 7 veya daha az taşta, rok hakkı yokken ve tekrar geçmişi hakkında kesinlik sınırlamasına uyulduğunda kullanılır. Bilinmeyen veya belirsiz tablebase kategorileri kesin kabul edilmez; 50 hamle kuralındaki cursed-win/blessed-loss beraberlik olarak ele alınır. Servis erişilemezse yerel motor devam eder. Tablebase skoru yapay centipawn değerine çevrilmez ve hamle doğruluğunu/sınıflandırmasını değiştirmez; ek bilgi olarak saklanır.

Yalnızca tamamlanmış hesaplamalar kalıcı önbelleğe girer. Önbellek anahtarları motor/kurallar sürümünü, hedef derinliği ve konum geçmişini içerir. Önceki sürümün raporları kullanılmaz. Depolama hataları raporu engellemez. Motor hatası materyal temelli sahte bir doğruluk puanı üretmez; “Analizi yenile” ile yeniden denenebilir.

## Kullanım

Maç sonucundan normal analiz ekranını aç. Hamle listesi ve grafiği tıklanabilir; klavyede sağ/sol oklar, Home/End desteklenir. Aday devamdaki herhangi bir hamleye tıklamak o konumu açar. Taşa ve hedef kareye tıklayarak alternatif üretilebilir; terfi taşı panelden seçilir. “Maça dön” veya Escape asıl maça döner. “Yeniden dene” öneriyi gizleyerek hamleyi yeniden bulmayı sağlar.

## Veri ve kaynaklar

- Stockfish.js 18 Lite, mevcut yerel WASM paketi; GPLv3. https://github.com/nmrugg/stockfish.js
- Açılış verisi: https://github.com/lichess-org/chess-openings — CC0. Sabit kaynak revizyonu ve konum sayısı `vendor/openings-source.json` içindedir. `npm run build:openings` internet üzerinden günceller.
- chess.js 0.10.3, mevcut uygulama sürümünün yerel kopyası. https://github.com/jhlywa/chess.js — BSD-2-Clause.
- WDL modeli: https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html
- Syzygy API: https://github.com/lichess-org/lila-tablebase

## Doğrulama

`npm test`: skor yönü, mate=0, WDL, monoton doğruluk, feda, tek yasal hamle, rok, geçerken alma, terfi, tekrar, 50 hamle, geçersiz FEN, açılış anahtarları, MultiPV derinlik bütünlüğü, iptal ve motor arızası testleri.

`npm run test:browser`: Playwright ve Edge gerektirir. Yerel HTTP sunucusunda gerçek Stockfish WASM kullanır; Firebase girişini yalnızca test sayfasında değiştirerek üretim verilerine yazmaz. Matlı maç, rapor, varyasyon, yeniden deneme, önbellek, iptal, özel FEN/hamle numarası ve mobil taşma kontrollerini yapar. Masaüstü/mobil ekran görüntülerini `tests/` altına kaydeder. Bu testler Firebase sosyal işlevlerinin veya tüm oyun modlarının uçtan uca testi değildir.


## Sınıflandırma kalibrasyonu

PowerShell üzerinde `$env:ANALYSIS_CALIBRATE="1"; npm run test:browser` gerçek motorla Ruy Lopez ana devamını, açıkta bırakılan veziri ve Stockfish’in kendi seçtiği hamlelerden oluşan bir oyunu inceler. Beklenen davranışlar doğrulanır ve ham raporlar `tests/analysis-calibration.json` dosyasına kaydedilir. Yüzdeler belirli bir sonuca zorlanmaz.
