# Bilgisayarda tam Stockfish ile maç analizi

Site GitHub Pages üzerinde kalır. Hesaplama, bilgisayarda yalnızca `127.0.0.1:8766` üzerinde çalışan yardımcıda yapılır; ücretli sunucu ve harici analiz aboneliği gerekmez. Bilgisayar kapalıysa veya yardımcıya ulaşılamıyorsa tarayıcı motoru çalışır. Telefonda, bilgisayarın yerel yardımcısına otomatik bağlantı denenmez.

## Eklenen sistemler

- **Tam Stockfish 18 NNUE:** mevcut resmî Windows AVX2 motoru kullanılır. WASM/Lite sonuçlarıyla aynı raporda birleştirilmez.
- **Yerel toplu analiz:** PGN bir kez gönderilir. Hamleler ayrı Stockfish süreçlerine dağıtılır; arama çıktısını tarayıcıya sürekli taşımak yerine ilerleme yaklaşık saniyede üç kez iletilir. Tahta ve rapor arayüzü motor çıktısı işlemekle meşgul edilmez.
- **Ölçülmüş kaynak ayarı:** bu bilgisayarda iki süreç, süreç başına iki işlem parçacığı ve 128 MB hash seçildi. Dört süreç ve daha fazla işlem parçacığı ayrıca sınandı; bütün maçlarda daha hızlı olmadıkları için etkinleştirilmedi. Toplam CPU ve hash sınırları uygulanır.
- **Derin doğrulama:** ilk inceleme 16 derinliktedir. Yeni yerel akışta kritik hamleler en az **22**, gerektiğinde **24/26/28** derinlikte doğrulanır. Karar sınırı değişirse ek teyit yapılır; tamamlanmayan veya tutarsız rapor açılmaz. Tarayıcıdaki mevcut 16 / 20–28 politikası korunur.
- **Arama maliyetini azaltma:** zayıf oynanan hamlelerin derin incelemesi tam konumda en iyi hamle aramasıyla başlatılabilir. En iyi hamle, ilk incelemedeki üç aday ve oynanan hamle aynı hedef derinlikte karşılaştırılır. Hamle en iyiye yakın çıkarsa özel etiketlerden önce tam konumda üç adaylı arama da yapılır. Kısıtlanmış aday araması tek başına benzersiz hamle veya taş fedası kanıtı sayılmaz. Bir ve üç adaylı konum kayıtları farklı anahtarlarla saklanır.
- **Maçlar arası ortak önbellek:** aynı motor, ağ, politika ve tam hamle geçmişiyle ulaşılmış açılış konumlarının tamamlanan hesapları farklı maçlarda da kullanılabilir. Tekrar/beraberlik geçmişi farklı konumlar birleştirilmez.
- **Kalıcı raporlar:** tamamlanan rapor ve ara hesaplar bilgisayarda `.cache/chess-review` altında saklanır. Rapor dosyaları 30 gün, en fazla 64 kayıt / 128 MB; ortak hesap dosyası en fazla 32 MB ile sınırlandırılır. Dosyalar geçici dosyadan atomik olarak değiştirilir. Disk hatası değerlendirmeyi değiştirmez; o oturumdaki bellek kaydı korunur.
- **Duraklatma ve devam:** tamamlanan sonuçlar saklanır. İptal edilen arama boşaltılır, çalışan süreçler kapatılır; eksik incelemeler daha sonra sürer. Aktif maç ve gizlenen sekme, maç sonrası otomatik hazırlığı durdurur.
- **Otomatik seçim:** Ayarlar → Analiz motoru → Otomatik seçeneği, yardımcı açıksa ve tarayıcı izni verilmişse yerel tam motoru tercih eder. Kullanıcı özellikle tarayıcı motorunu seçmişse bu tercih korunur. Eski yardımcıda toplu hizmet yoksa standart motor akışı çalışır.
- **Windows başlangıcı:** `SATRANC-YEREL-MOTOR.bat` kurulum ve gizli otomatik başlatmayı etkinleştirir. `SATRANC-YEREL-MOTOR-OTOMATIK-KAPAT.bat` başlangıç kaydını kaldırır. Yardımcının sağlıklı olduğu durumda tekrar çalıştırmak ikinci bir yardımcı açmaz. Bu bilgisayarda kurulum ve başlangıç kaydı yapıldı.

## Gerçek ölçümler

İlk bağlantıda **Ayarlar → Okunabilirlik ve analiz motoru → Yerel motoru bağla** düğmesine bas. Tarayıcı yerel ağ erişimi isterse izin ver. Reddedilmişse adres çubuğundaki site izinlerinden yerel ağ erişimini açıp tekrar dene. Bu izin, internet sitesinin bilgisayardaki yardımcıya ulaşması içindir; bilgisayarı ağdaki diğer cihazlara açmaz. Yardımcı bu bilgisayarda kuruldu ve Windows başlangıcına eklendi. Başka bir bilgisayarda önce `SATRANC-YEREL-MOTOR.bat` çalıştırılmalıdır. Chrome'un bu izin gereksinimi için [resmî açıklama](https://developer.chrome.com/blog/local-network-access).

Aynı bilgisayarda, aynı resmî tam Stockfish ağıyla yapılan üç maç ölçümü:

| Örnek | Önce: tek süreç, 2 parçacık | Son: iki süreç, kritik minimum 22 |
|---|---:|---:|
| Kısa mat · 4 yarım hamle | 22,6 sn | 14,7 sn |
| Açılış ve taktik · 19 yarım hamle | 41,7 sn | 33,0 sn |
| Uzun açılış · 31 yarım hamle | 131,3 sn | 102,0 sn |

Son sürümde derinlik hedefi azaltılmadı; kritik minimum yükseltildi. İlk hız denemesi 17,9 / 36,4 saniye verdi, fakat bazı konumların derin referanslarla farkı fazla olduğu için o ayar yayımlanmadı. Dört tartışmalı konum ayrıca tam konumda üç aday ve oynanan hamle karşılaştırmasıyla 24 derinlikte incelendi. Son sürümde bu referanslarla değerlendirme kaybı farkı en fazla yaklaşık 0,011 oldu. Bu ölçüm bütün olası konumlar için matematiksel doğruluk garantisi değildir.

Hazır rapor tarayıcı önbelleğinden yaklaşık 30 ms içinde yeniden açıldı. Yeni bir tarayıcı oturumunda yerel rapor da sıfır yeni motor aramasıyla kullanılabildi. Bu süreler raporun ilk hesaplama süresi değildir. Her yeni uzun maçı birkaç saniyede bitirme hedefi, bu donanımda korunmuş derinlik ve doğrulamalarla henüz sağlanmış değildir.

## Doğrulama

- `node --test tests/*.test.mjs`: satranç kuralları, kaynak/derinlik kimliği, özel etiketlerin kapsamı, paralel iş dağıtımı, kaynak sınırları, iptal, bozuk veri, ortak ve kalıcı önbellek.
- `node tests/native-review-browser.cjs`: gerçek tam motor, otomatik seçim, raporun tamamlanma kapısı, tarayıcı ve yerel önbellek, yeni oturum, duraklatma/devam ve hizmet hatasında standart motora geçiş.
- `node tests/native-review-speed.mjs`: aynı motorla farklı süreç/parçacık ayarlarının gerçek maç karşılaştırması.
- `node tests/native-review-reference.mjs`: tartışmalı konumlarda bağımsız 24 derinlik / üç aday kontrolü.
- `node tests/mobile-ui.cjs` ve statik paket üzerinde `node tests/site-integration.cjs`.

Stockfish de analizde çoklu aday aramasının ilave kaynak tükettiğini açıklar: [Resmî Stockfish analiz ayarları](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#analysis). Burada özel etiketler için gerekli aday kanıtları korunur; yalnızca bütün derin aramaların aynı genişlikle tekrarlanması azaltılır.
