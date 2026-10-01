# Satranç analizi hızlandırma · ikinci tur

Stockfish 18 değerlendirme ağı ve tam güç korunur. İlk inceleme 16; kritik kararların doğrulaması 20–28 derinliktedir. Tam konum araması, oynanan hamle karşılaştırması ve karar tutarlılığı tamamlanmadan rapor açılmaz.

## Eklenen sistemler

- **İlerlemeye göre arama süresi:** analiz, eski 3/8/12/18 saniye sınırları doldu diye kesilmez. Düğüm/derinlik ilerlemesi izlenir; 30 saniye ilerlemeyen veya beş dakika sınırına ulaşan tek arama durdurulur. Duraklatma/iptal hemen gönderilir, `bestmove` boşaltılmadan yeni konuma geçilmez. Hedefe ulaşmayan sonuç tamamlanmış sayılmaz.
- **Tamamlanmış derinlik basamakları:** 16/20/22/24/26/28 basamaklarında bütün aday satırları aynı derinlikte tamamlanmışsa saklanır. Kullanıcı aramayı durdursa bile bu kanıtlar yeniden kullanılabilir. Eksik aday, sınır puanı veya tamamlanmayan hedef terfi ettirilmez.
- **Toplu önbellek:** maç açılışında konum kayıtları topluca okunur; yazımlar tek işlemde birleştirilir. Kontrol noktalarında ve tamamlanan raporda disk işleminin sonuçlanması beklenir. Depolama başarısız olursa bu sekmedeki bellek kayıtları korunur; yeniden açılışta diskten devam edileceği garanti edilmez. Depolama hatası hesap sonucunu değiştirmez. Uygun tam derinlik kaydı, gereksiz daha yüksek doğrulama zinciri başlatmamak için önce kullanılır.
- **Güvenli kimlik:** motor/ağ, tam güç, aday kapsamı, derinlik, başlangıç FEN'i ve bütün hamle geçmişi anahtara dahildir. Full/Lite farklı kayıtlardır. Motor değiştiğinde yarım raporun eski motor verileri yeni motor sonuçlarıyla birleştirilmez; derin doğrulama ve alıştırma gerekirse bütün raporu yeni kaynakla hazırlar.
- **Hafif konum akışı:** hesaplama için ileri/geri hareket eden ayrı Chess örneği kullanılır; tekrar ve beraberlik geçmişi korunur. Hamle sayısını öğrenmek için geçmiş tekrar tekrar SAN'a çevrilmez. Motor konum komutları önceden hazırlanır; aynı FEN'in yasal hamle sayısı tekrar hesaplanmaz. Tahta ve varyantlar bağımsız örneklerle çalışır.
- **Cihaz ölçümü:** ilk uygun masaüstü boşluğunda 1/2/4 işlem parçacığı ve uygun 64/128/256 MB bellek seçenekleri ölçülür. Ön taramanın en iyi iki seçeneği ayrıca 20 derinlikte tam arama ve dört aday karşılaştırmasıyla sınanır. Yakın sonuçlarda düşük işlem parçacığı sayısı tercih edilir. Ölçüm 30 gün saklanır; aktif oyun/analiz başlayınca durur. Telefonlar kendiliğinden bu ölçümü başlatmaz. Ayarlar → Analiz performansı altında yeniden ölçülebilir.
- **Yerel motor:** değişmeyen UCI ayarları gönderilmez; aynı turdaki komutlar sıralı paketlerle iletilir. Eski yardımcıyla tek komut protokolü de çalışır. Paket içindeki bütün komutlar gönderilmeden önce doğrulanır. Yerel bağlantı kesildiğinde tercih korunur; uygun sonraki başlatma/odaklanmada en fazla 45 saniye aralıkla yeniden bağlantı denenir. Uzun aktif arama, boş oturum temizliği yüzünden kesilmez.
- **Maç sonrası otomatik hazırlık:** sadece kullanıcının bitmiş 1v1/2v2 maçı hazırlanır. Ön hazırlık ve ekrandaki analiz aynı hesaplama/doğrulama kodunu kullanır. Aktif maç, analiz, başka ekran veya gizlenen sekme hazırlığı durdurur ve ilerlemeyi saklar. Hazır rapor açılırken tekrar motor araması yapılmaz. Ayarlar'dan kapatılabilir.
- **Maç başına ölçüm:** motor açılışı, tam arama, aday karşılaştırması, önbellek ve her konumun hedef/gerçek derinliği, süre/düğüm sayısı dışa aktarılan motor verisinde bulunur. Önceki maçın motor sayaçları yeni maç ölçümüne dahil edilmez.

## Ölçümler ve sınırlar

Başlangıç sürümü `.cache/speed2-baseline` içinde donduruldu. Gerçek Edge/Stockfish testinde iki sürüm de üç maçın bütün hamlelerini tamamlanmış ve tutarlı olarak raporladı. İkinci turda cihazda ölçülmüş 2 işlem parçacığı / 256 MB ayarı kullanıldı:

| Maç | Önce | Sonra |
|---|---:|---:|
| Kısa mat · 4 yarım hamle | 34,7 sn | 30,6 sn |
| Açılış ve taktik · 19 yarım hamle | 72,8 sn | 44,2 sn |
| Uzun açılış · 31 yarım hamle | 145,1 sn | 155,3 sn |

Bu sonuçlar her maçta aynı hızlanma anlamına gelmez. Stockfish'in paralel aramaları aynı derinlikte farklı sonuçlar üretebilir; sınırdaki kararlar ek doğrulama gerektirir. Uzun örnekte ek derin aramalar süreyi artırdı; bunlar hız göstermek için kaldırılmadı. Hız ve kalite bu yüzden ayrı ölçülür.

Ön hazırlıkla tamamlanan kısa maçın raporu ayrı gerçek tarayıcı testinde **184 ms** içinde açıldı; açılış sırasında **0 yeni motor araması** yapıldı. Bu, hesap işini maçın bitişinden sonraki boşluğa taşır; ham hesap süresinin 184 ms olduğu anlamına gelmez.

İki bağımsız tek parçacıklı motor denemesi 14,3 → 13,8 saniye verdi (yaklaşık %4). Aday kanıtları tutarlı kaldı, ancak %15 kabul eşiğine ulaşmadı; ek bellek kullanan paralel düzen etkinleştirilmedi. Aynı üç derinlik hedefinde mevcut yerel Full motor 11,0 saniye verdi. Full ve Lite farklı değerlendirme ağları kullandığından bunlar aynı hesap yükü olarak sunulmaz.

WASM derleme denetimi mevcut dosyalarda 3937/3941 SIMD komutu ve çok parçacıklı dosyada 1528 atomik komut saptadı. Değerlendirme ağı ve motor dosyaları değiştirilmedi. Ölçülmüş kazanç olmadan farklı bir derleme devreye alınmadı.

## Doğrulama ve yeniden ölçüm

- `node --test tests/*.test.mjs`
- `node tests/analysis-browser.cjs`: gerçek WASM, 67 referans konumu, 11 gerçek motor probu; rapor, varyant, duraklatma/iptal ve önbellek.
- `node tests/analysis-preparation-browser.cjs`: gerçek otomatik hazırlık, hazır rapor, aktif maç koruması ve cihaz ölçümü.
- `node tests/engine-speed2-experiments.cjs`: tek motor, iki bağımsız motor ve gerçek yerel Full motor.
- `USE_MEASURED_PROFILE=1` ile `node tests/review-speed2.cjs`: dondurulmuş önceki sürüm ve ölçülen cihaz ayarıyla son sürüm. PowerShell'de önce `$env:USE_MEASURED_PROFILE='1'` kullanılır.
- `node tests/mobile-ui.cjs`, `node tests/chess-upgrade-browser.cjs`, `node scripts/build-pages.cjs` ve statik paket üzerinde `tests/site-integration.cjs`.

Yerel motor için `SATRANC-YEREL-MOTOR.bat` ve Ayarlar → Bilgisayarımdaki Stockfish kullanılır. Yardımcı yalnızca bilgisayar açıkken çalışır; Windows açılışına kendiliğinden eklenmez. Site GitHub Pages üzerinde kalır; yeni ücretli sunucu gerekmez.
