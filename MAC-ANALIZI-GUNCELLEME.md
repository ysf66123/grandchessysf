# Maç İnceleme Stüdyosu · 1 Ekim 2026

En yeni sürüm: [Mobil arayüz, referans sınıflandırmalar ve maçtan öğrenme güncellemesi](MOBIL-VE-ANALIZ-GUNCELLEME.md). Aşağıdaki bölümler önceki sürümlerin geçmişidir; güncel Türkçe adlar yeni belgede yer alır.

## Tamamlanma ekranı ve hız güncellemesi · review2

- Hamle adları Parlak, Harika, En İyi, Kitap, Mükemmel, İyi, Yanlış, Hata, Kaçan Fırsat ve Gaf olarak düzenlendi. İsimler raporda, filtrelerde ve notlu PGN çıktısında aynı kaynaktan kullanılır.
- Maç raporu ve tahta, bütün hamleler ve gerekli derin kontroller tamamlanmadan açılmaz. Hazırlık, bütün hamlelerin incelenmesi, kritik kararların doğrulanması ve rapor oluşturulması ayrı aşamalarda gösterilir. Yüzde tamamlanan iş kapsamını belirtir; kalan süre tahmini değildir.
- Eksik derinlik, tutarsız karar, motor hatası veya duraklatmada sonuç ekranı açılmaz. Tamamlanan hesaplar korunarak devam edilebilir. Önceden tamamlanmış raporlar, hamle geçmişi de doğrulanarak önbellekten açılır.
- Aynı maçın aramalarında Stockfish konum belleği korunur; maç veya motor gücü değişince temizlenir. Her aday aramasında belleğin silinmesi kaldırıldı. Tamamlanmış yüksek derinlikli aramalar tekrar kullanılır; eksik aramalar tamamlanmış diye saklanmaz.
- İlk inceleme 16, kritik kontrol 20, değişen veya sınırdaki kararların doğrulanması 22 hedeflerini korur. Devam edilen kararsız konumlarda yeni ve daha derin hesap yapılır; aynı önbellek sonucu kendisine karşı doğrulama sayılmaz. Tam konum ve aday karşılaştırma derinlikleri ayrı izlenmeye devam eder.
- Raporun bütün bileşenlerinin her hamlede yeniden çizilmesi kaldırıldı. İnceleme sırasında yalnızca hafif ilerleme bilgisi güncellenir. Motor/açılış hazırlığı ve uygun konumlarda yardımcı oyun sonu verisi sorgusu paralel yürür.

Üç örnek maç, ayrı tarayıcı oturumlarında boş önbellekle gerçek Stockfish WASM üzerinden karşılaştırıldı:

| Örnek | Önce | Sonra |
| --- | ---: | ---: |
| Dört yarım hamlelik mat | 17,50 sn | 13,61 sn |
| Ruy Lopez, 16 yarım hamle | 29,50 sn | 12,15 sn |
| Vezir kaybı, 6 yarım hamle | 38,30 sn | 18,12 sn |

Toplam süre 85,30 saniyeden 43,88 saniyeye indi: bu üç örnekte yaklaşık %49 hızlanma. Derinlik hedefleri, doğruluk formülü ve karar tutarlılığı eşikleri azaltılmadı. Konum belleğinin korunması motor puanlarını küçük ölçüde değiştirebilir; sonuçlar birebir aynı sayı garantisi veya bütün maçlar için %49 hız garantisi değildir.

Doğrulama: 241 test geçti. Gerçek Stockfish ile tamamlanmadan raporun gizlenmesi, dört aşamalı ilerleme, duraklat/devam et, tamamlanmış rapor önbelleği, iptal, mat ve 390 piksel mobil görünüm kontrol edildi. GitHub Pages paketi gerçek uygulama entegrasyon testinden geçti.

---

Yeni bölüm tamamen Türkçe bir Stockfish 18 çalışma alanı sunar: yeni tahta görünümü, hamle defteri, Genel bakış / Hamle analizi / Kritik anlar sekmeleri, evre raporu ve gerçek motor kanıtları.

## Kritik düzeltmeler

- Tam konum aramasının derinliği ile yalnızca seçili adayların karşılaştırma derinliği artık ayrı izlenir. Daraltılmış aday aramasının derinleşmesi, sığ tam aramayı kesin sonuç yapmaz. İki arama da tamamlanmadan özel hamle etiketi doğrulanmaz.
- Mat sonucunun değişmesi veya sınıflandırma eşiğinin aşılması kararsızlık sayılır; yalnızca sayısal kaybın küçük görünmesi yeterli değildir.
- Terminal sonuçlar bütün adaylara uygulanır. Tekrar ve beraberelik geçmişi maçın hamleleriyle korunur.
- Duraklatılan veya eksik analizde doğruluk yaklaşık işaretiyle gösterilir. Gerçek kapsam, hedef yerine ulaşılan derinlik ve geçici karar sayısı raporda görünür.
- İncelenmemiş konumlara grafikte sıfır puan yazılmaz; hamle numaraları eksik sonuçlarda kaymaz.
- Geçersiz PGN mevcut raporu silmez. FEN başlangıçlı ve siyahın başladığı maçlar desteklenir.
- Doğruluk halkalarının eski kimlik eşleşmesi düzeltildi; gerçek yüzdeyi gösterirler.
- Motorun tercihinin puanı ile oynanan hamlenin puanı ayrıldı; daha güçlü hamlenin yanında yanlışlıkla oynanan hamlenin mat puanı gösterilmez.
- İmkânsız şah konumları, eksik kale ile rok hakları ve sahte geçerken alma hedefleri FEN girişinde reddedilir.

## Yeni çalışma araçları

- Parlak Hamle (!!), Harika Hamle (!), En İyi, Kitap Hamlesi, Mükemmel, İyi, İsabetsizlik (?!), Hata (?), Kaçırılan Fırsat ve Büyük Hata (??) adları ve renkleri.
- Hamle sınıfına ve kritik kayba göre filtre; kalite kartlarına dokunarak hamlelere geçiş.
- En fazla sekiz kritik an kartı; seçili konuma doğrudan dönüş ve daha güçlü hamleyi bulma alıştırması.
- Açılış / oyun ortası / oyun sonu doğruluğu. Evreler materyal ve hamle numarasıyla belirlenen açık bir sezgisel ayrımdır.
- Ortalama piyon kaybı ve gerçek karar doğruluğu. Mat puanları ortalama piyon kaybına katılmaz; zorunlu ve kitap hamleleri karar doğruluğundan çıkarılır. Ana doğruluk bunlardan etkilenmez.
- Motor devamlarından yasal olarak çıkarılan mat, şah, terfi, rok ve taş alımı notları; gerçek tam arama / karşılaştırma derinliği ve düğüm sayısı.
- Sonuçları koruyarak duraklatma ve devam etme; mevcut sonuçların ve tamamlanmış hesapların yeniden kullanımı.
- PGN yapıştırma veya dosya yükleme; motor değerlendirmelerini ve Türkçe etiketleri içeren notlu PGN indirme; ham motor raporunu JSON olarak indirme.
- Masaüstünde tahta altındaki hamle defteri, mobilde kendi sekmesi. Alternatif devam, terfi seçimi, derin doğrulama, klavye gezinmesi ve dokunma desteği korunur.

## Yöntem ve sınırlar

Hamle puanları aynı başlangıç konumundaki Stockfish CP/mat karşılaştırmasına dayanır. İlk geçiş 16, kritik konumlar 20, değişen veya sınırdaki kararlar 22 derinlik hedefler. Süre sınırına ulaşan sonuçlar açıkça geçicidir. Her cihaz aynı derinliğe aynı sürede ulaşmaz.

Doğruluk için [Lichess’in açık formülü](https://lichess.org/page/accuracy), sınıflandırmaların kavramsal karşılığı için [Chess.com’un resmi açıklaması](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc) kullanıldı. Chess.com’un rating uyarlaması veya özel CAPS2 hesabı kopyalanmış değildir. Puanımız Elo tahmini veya kişisel kazanma ihtimali değildir. Parlak/harika etiketleri muhafazakâr motor kanıtı gerektirir; taktik yorumları hesaplanan devamla sınırlıdır.

## Doğrulama

- Tam test paketi: 238 test geçti.
- Gerçek Stockfish WASM: mat, PV devamları, alıştırma, önbellek, iptal, duraklat/devam et, geçersiz PGN koruması, notlu PGN yeniden içe aktarımı ve 360/390 piksel mobil paneller.
- Kalibrasyon örnekleri: Ruy Lopez ana hattı Beyaz %99,9 / Siyah %98,9; veziri açıkta bırakan taraf %35; motorun seçtiği kısa maç %99,7 / %100. Bunlar üç örnek üzerinden regresyon kontrolüdür, geniş ölçekli doğruluk kanıtı değildir.
- Statik GitHub Pages paketi gerçek uygulama entegrasyon testinde kontrol edilir; Wild Rift modu ve hesap akışları korunur.
