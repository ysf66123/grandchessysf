# Maç analizi — 23 Eylül 2026

Aktif uygulama `app-v2.js` üzerinden `modules/analysis-v2.js` yükler. Eski `analysis.js` etkin giriş noktası değildir.

## Yapı

- `analysis-engine.mjs`: Paylaşılan Stockfish iş kuyruğu, UCI protokolü, zaman sınırı, iptal ve yeniden başlatma. Botların güç ayarlarını korur. MultiPV sonuçlarını aynı tamamlanmış derinlikten alır; bound skorları kesin puan gibi kullanmaz.
- `analysis-core.mjs`: Skor yönü, WDL/beklenen puan, sınıflandırma, doğruluk, yasal PV oynatımı ve temkinli feda tespiti. Arayüzden bağımsız test edilir.
- `analysis-data.mjs`: Yerel açılış konumları, isteğe bağlı Syzygy servisi ve motor devamına dayalı açıklamalar.
- `analysis-v2.js`: PGN geçmişi, kademeli rapor, görselleştirme, devam denemeleri, kritik hamle gezinmesi, yeniden çözme ve paylaşma entegrasyonu.

## Hesaplama

İlk tur derinlik 14 ve yaklaşık 1,8 saniyelik arama bütçesi kullanır. Kritik veya tamamlanmamış konumlar derinlik 18 ve 5,5 saniyelik bütçeyle yeniden incelenir. Kullanıcı seçili hamleyi derinlik 22 hedefiyle inceletebilir. Her arama gerçek derinliğiyle raporlanır; cihazın hızına bağlı olarak hedefe ulaşamayabilir.

En iyi ve oynanan hamle aynı kök konumdan değerlendirilir. Oynanan hamle ilk MultiPV sonuçlarında yoksa ilk adaylarla birlikte `searchmoves` üzerinden yeniden karşılaştırılır. Motor konuma yalnızca FEN ile değil, başlangıç FEN'i ve hamle geçmişiyle ulaşır. Farklı kaynaklı Lichess bulut CP skorlarının yerel sonuçlarla karıştırılması kaldırılmıştır.

Beklenen puan, mevcutsa Stockfish WDL verisinden `(kazanç + beraberlik / 2) / toplam` olarak bulunur. Hamle kaybı en iyi ve oynanan devamın beklenen puan farkıdır. Hamle doğruluğu `100 × exp(-4 × kayıp)`, maç doğruluğu oyuncunun incelenen hamlelerinin aritmetik ortalamasıdır. Etiketler doğruluk puanını değiştirmez. Bu, projeye ait açık bir metriktir; Chess.com CAPS2 veya oyuncunun gerçek kazanma olasılığı değildir.

Feda etiketi, derin arama tamamlandığında, önerilen devamda oynanan taşın gerçekten alınması ve hemen geri alınamayan materyal açığının sürmesi gibi temkinli koşullara dayanır. Tüm stratejik fedaları saptama iddiası yoktur. Tek yasal hamle bulunması tek başına “Kritik Hamle” etiketi üretmez.

Mat, beraberlik ve tekrar geçmişi ayrıca ele alınır. Syzygy sonucu 7 veya daha az taşta, rok hakkı yokken ve tekrar geçmişi hakkında kesinlik sınırlamasına uyulduğunda kullanılır. Bilinmeyen veya belirsiz tablebase kategorileri kesin kabul edilmez; 50 hamle kuralındaki cursed-win/blessed-loss beraberlik olarak ele alınır. Servis erişilemezse yerel motor devam eder. Tablebase skoru yapay centipawn değerine çevrilmez.

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
