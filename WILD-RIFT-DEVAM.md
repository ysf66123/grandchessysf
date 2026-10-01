## Hız ve hedefe uygulanabilirlik — 1 Ekim 2026, 03.17 öncesi

20261001-combat3: Süreli devam talebinde iki ek kritik iyileştirme yapıldı. Yeni zorunlu alan yok; yönetici erişimi, Türkçe arayüz ve son set altındaki yükleme düzeni aynı kaldı.

1. Aynı plan içindeki eşya seti kapsam hesapları karar süresince yeniden kullanılır; tam kaynak seti seçimi planlayıcının hesapladığı son kapsamı tekrar hesaplamaz. Önbellek yalnızca tek plan çağrısına aittir. Değişen taslak, eşya gözlemi, kaynak paketi ve başka kullanıcıya taşınmaz. Aynı beş rakipli Ahri senaryosunda 4 ısınma + 35 ölçüm: önce ortalama 12.746 ms / medyan 12.741 ms; sonra ortalama 9.843 ms / medyan 9.840 ms. Bu örnekte yaklaşık yüzde 23 azalma; tüm cihazlarda sabit hız garantisi değildir. Bu örneğin eşya seti korunmuştur.
2. Otomatik iyileşme/kalkan azaltma değişikliği, hedefler üzerindeki uygulama faktörlerinin tehdit ağırlıklı kontrolünden geçer. Genel tetikleme doğru olsa bile kritik hedefe uygulanamayan karşı etki güvenilir sayılmaz. Kaynak toplamı, satın alınmış eşya, korunan ilk iki ana eşya ve set sürekliliği kuralları devam eder. Hedef listesi ve sınırlı uygulama nedeni alternatif açıklamasına taşınır. Boş rakipte genel koşula dönülür; kazanma veya isabet yüzdesi türetilmez.

Son güncellemeler ekranında iki yeni avantaj kartı eklendi: toplam 9 güncel kart ve 16 geçmiş kart. Veri paketi ve kaynak tarihleri bu kod güncellemesi için yeniden damgalanmadı.

Doğrulama: 231 birim/HTTP testi, genişletilmiş Wild Rift masaüstü ve 360 px mobil tarayıcı testi, statik Pages paketinden gerçek uygulama entegrasyonu geçti. 9 güncel ve 16 geçmiş kart, erişim/çıkış temizliği ve seçim sırasında veri isteği açılmaması sınandı.

## Koşula göre eşya ve resmî şampiyon kontrolü — 1 Ekim 2026

20261001-combat2: Kullanıcının onayladığı yedi geliştirme uygulandı. Yönetici erişimi, Türkçe arayüz ve son setin hemen altındaki rün/büyü/yetenek sırası korundu. Yeni zorunlu manuel alan yoktur.

1. Resmî 7.3a değişiklikleri 12 şampiyonun kaynak nitelik/yetenek kayıtlarıyla alan ve yetenek kimliğine göre karşılaştırılır. Samira zırh büyümesi 5 yerine Riot 5.5 ile hesaplanır; kaynak ham kaydı kanıt için korunur. Senna'nın eski 7.3 ek tablosundaki 0.4 taban/oran, 0.6 başlangıç bonusu ve 0.05 büyüme yerine 7.3a'nın 0.3 / 0.3 / 1.1 / 0.025 alanları saldırı modeline uygulanır. Caitlyn/Xayah diğer belge çelişkileri nedeniyle hâlâ kesin hız hesabına alınmaz. Hwei'in birbirini dışlayan alt yetenekleri ve seviyeye bağlı aralıkları sabit toplam hasara eklenmez. Eşleşmeyen/koşullu veya çelişkili değişen sayılar sayısal referanstan çıkarılır; bu denetim tüm yetenekler için eksiksiz resmî doğrulama olarak sunulmaz.
2. Fire eşya tooltiplerinden sabit/yüzdelik delme birimleri ve azaltma pasifleri ayrı okunur. Pozitif direnç referansı azaltma → yüzdelik delme → sabit delme sırasındadır. Gerçek hasar değişmez. 9. seviye taban + yalnızca gözlenen eşya ile kaynak seti varsayımları ayrılır; kaynak seti satın alınmış eşya değildir. Doğrulanmayan delme veya kaynak çelişkisi kesin katkıya alınmaz. Panel DPS ya da tam savaş simülasyonu değildir.
3. Yun Tal kritik, Manamune mana ve Guinsoo saldırı hızı için birikimsiz / yarı / tamamlanmış ek katkı ve kaynak tetikleme şartı gösterilir. Gerçek ve ara parçadan devralınan birikim bilinmez. Gelecekteki kritik hazır kritik niteliğine eklenmez; birikim bağımlılığı set maliyetinde sınırlı bir belirsizlik katkısı taşır. Dönüşmüş eşyanın ana alışveriş biçimi belirtilir.
4. Biriken saldırı/azaltma katkıları kısa, dengeli ve uzayan çatışma referanslarında ayrı değerlendirilir; ilk eşya kısa takas ağırlığı taşır. Bloodletter bir uygun büyü yeteneğinde yüzde 7.5 azaltma, üç uygun tetiklemede yüzde 22.5 referansı alır; gerçek isabet veya süre garantisi verilmez. Terminus'un dönüşümlü tetikleme döngüsü kaynakta tam açıklanmadığından dengeli direnç hesabında yüzde 30 tam birikim varsayılmaz.
5. İyileşme/kalkan azaltma uygulaması her hedefin tehdit ağırlığı, kendi hasar türü ve erişim koşuluyla hesaplanır. Sadece saldırıyı alınca çalışan pasif, başka rakibin saldırısıyla hedefe uygulanmış sayılamaz. Güncel Thornmail hem hasar verme hem hedefin saldırısını alma ile çalışır; eski yalnızca saldırı alma kuralına geri çevrilmedi. Takım görevleri de hedef bazında sınanır.
6. Güncel ikili yeteneklerden açılış kontrolü → aynı hedefe takip → güvenli çıkış/koruma planı oluşur. Partner ve iki rakip kesinleştiğinde karşı seçim skoruna sınırlı, açıkça çıkarım olarak sunulan ortak takas katkısı eklenir. Rakibin atılışını durdurmak kendine hareket becerisi değildir; hedefe bağımlı saldırı atılışı serbest kaçış gibi gösterilmez.
7. Arayüz önceki öneriyi hesap/şampiyon/rol/yama ile oturum içinde tutar. Önceki set yalnızca aynı güncel kaynak ve hâlen geçerli yasal adaylar arasındaysa 0.8 puanlık küçük farkta korunur. Önemli değişim, kaldırılan eşya, farklı şampiyon/yama, manuel set veya gerçek envanter kuralı bu geçmişi geçersiz kılabilir. Karşı olasılık hesapları bağımsızdır; geçmişi veya gerçek taslağı değiştirmez. Çıkış/temizleme geçmişi sıfırlar. Resmî sayısal kontrol kapsamının toplu düşüşü de veri yazma korumasına eklendi.

Yeni yedi avantaj kartı en üstte, önceki 16 geliştirme geçmişte korunur. Ayrıntılar katlanabilir; ikili plan üç kısa karttır. Direnç karşılaştırması mobilde okunabilir hedef kartlarına dönüşür; masaüstünde tablo olarak görünür.

Veri kapsamı: 142 şampiyon, 887 rol seti, 715 yetenek kaydı, 684 ayrıştırılmış hasar paketi, 65 resmî tarif, 113 pasifli eşya, 19 sayısal menzil kanıtı, 141 resmî saldırı hızı tablosu kaydı. Bu çalışma kaynak erişimi olmayan menzilleri tahminle doldurmadı. 12 değişen şampiyon ve dokuz kritik eşya gerçekten yeniden çekildi; diğer önbellek kayıtları yeni ayrıştırıcıyla özgün başarılı kontrol tarihleri korunarak işlendi. Yöntem sürümü 9. Yerel sürekli izleyici bu çalışmada başlatılmadı.

Doğrulama: 229 birim/HTTP testi geçti. Yeni 20 regresyon senaryosu resmî sayısal kontrol, ayırıcı olmayan Riot satırı, delme birimleri ve sırası, yüzdelik sınırın birikim sayısı sanılmaması, aşamalar, hedef uygulaması, ikili çıkış ve set sürekliliğini sınar. Genişletilmiş masaüstü/360 px mobil Wild Rift tarayıcı testi ve gerçek GitHub Pages paketi üzerinden uygulama entegrasyonu geçti. Son set altında yükleme dizilimi aynı yerde, yedi yeni / 16 geçmiş kart, iki direnç değeri aynı mobil kartta görünür; seçim sırasında veri isteği açılmaz. Görseller tests/wild-rift-combat2-*.png altında yerelde incelendi.

## Eşya etkileşimleri ve güvenli güncelleme — 1 Ekim 2026

20261001-interactions1: Kullanıcının onayladığı yedi madde uygulandı. Yönetici görünürlüğü korunur. Yeni zorunlu manuel alan yok; ayrıntılar katlanabilir panellerdedir.

1. Riot 7.3 saldırı hızı tablosundan 141/142 şampiyon için kayıt alındı; 7.3a belgesi de incelendi. Seviye büyümesi doğrusal değildir: her artışta 0.7 + 0.04 × önceki seviye. Sabit Jhin ritmi için sayı veya sıradan kritik DPS üretilmez. Ashe yavaşlatması, Graves saçmaları, Yasuo/Yone çift kritik ve fazla kritik dönüşümü, Zeri hız sınırı ve dönüşümü kaynak bilgilerine göre ayrılır. Kritik 200%, Infinity Edge 230% resmî/kaynak kayıtlarına bağlıdır; Yun Tal birikimi kendiliğinden tamamlanmış sayılmaz. Caitlyn ve Xayah belgenin ana bölümü ile ek tablosunda çelişir: kesin hız/sınır cezası kapalı. Hwei için tablo kaydı yoktur.
2. 7.2 → 7.3a bütün resmî zinciri incelendi; tarif kapsamı 58 → 65 oldu. Kaynak kontrolü 19 şampiyonda sayısal temel saldırı menzilini doğruladı. Erişim sınırlaması nedeniyle kalanlarda değer üretilmedi; bir saat geri çekilme ve sonraki yerel güncelleme yeniden denemesi var. Başarılı karşı seçim sayfası kontrolü menzili aynı yanıt içinden alır; fazladan istek gerektirmez. Sayısal menzilden yakın/uzak sınıfı çıkarılmaz. Ionia botunun hatalı 100 altın topluluk fiyatı, resmî 1000 altın fiyatıyla uzlaştırıldı; 3. aşama 1000 altın ek bedel doğru kalır.
3. Ölümcül hasarda pasif dirilme, elle staz, kendine/takım arkadaşına arındırma ve sonraki yeteneğe pasif kalkan ayrıldı. CC türleri, kaynaktaki kaldırma istisnaları ve tehdit ağırlığı hesaba katılır; karma kontrol grubunun tamamı çözülmüş sayılmaz. Kullanım açıklaması yalnızca seçili setteki savunmaları gösterir.
4. Kısa takas planı: hedefe yöneltilmiş yeteneğe yana kaçmayı kesin çözüm saymaz; minyon engeli yalnızca çarpma kanıtında kullanılır, delip geçen yeteneklerde kullanılamaz. Kendi kontrol/kaçış yeteneği, rakibin dokunulmazlık/kontrol bağışıklığı ve kaçışı birlikte ele alınır. Doğrulanmış, değişmeyen sayısal menzil farkı belirtilir. Beklemeler canlı sayaç değildir.
5. Tek eşya değişikliğinde rakip ihtiyaç katkısı, ana düzen maliyeti, değişiklik eşiği ve gerçek nitelik kaybı aynı set üzerinden hesaplanır. Arındırma uygulanabilirliği tüm kapsama ve satın alma sırasına yansır. Puanlar hasar ya da kazanma yüzdesi değildir.
6. En fazla üç karşı olasılık: rakibin kaynakta bulunan direnç eşyası, öne çıkan tehdit, takım savaşına geçiş. Aynı tam set motoru ayrı kopyalarda gerçekten çalışır; değişen/korunan set gösterilir. Ana taslak ve gerçek gözlemler değişmez, alınan eşya korunur, ağ isteği yok. Sonuçlar sınırlı bellek ve beş dakikalık anahtarla önbelleğe alınır.
7. Ana ve beş hedefli veri güncelleme yazıcısı kapsam/hasar kaydı/tarif/pasif kaybı, tarif toplamı/döngüsü ve açıklanamayan toplu fiyat değişikliğini yazmadan denetler. Başarısız veri diske ve GitHub gönderimine geçmez. Başarılı yazma son sağlam kopyayı korur; kontrol raporu veri paketinde yer alır. Denetim hata nedeni yerel sunucu durumunda açıklanır. Kaynak tarihleri başarısız kontrolle yenilenmez.

Son güncellemeler sekmesinde yedi yeni avantaj kartı; önceki dokuz madde ayrı geçmiş panelinde korunur. Rün/büyü/yetenek sırası son eşya setinin hemen altında kalır. Hızlı maç satın alınmış üçüncü aşama botunu aynı yuvada doğru adla gösterir.

Yerel güncelleyici bu çalışma sırasında sürekli izleme modunda başlatılmadı. Kaynak kapsamı ve kaynak çelişkileri arayüzde açıkça gösterilir. Yöntem sürümü 8, resmî kontrol yaması 7.3a.

## Otomatik maç yardımcısı — 1 Ekim 2026

20261001-auto1: Kullanıcının onayladığı az elle giriş isteyen dokuz madde ve ayrı “Son güncellemeler” sekmesi uygulandı. Yönetici erişimi korunur. Yeni zorunlu alan yoktur.

1. Kaynak yetenek sırası ile 5 / 9 / 13. seviye ve 1 / 3 / 5 ana eşya referansları hesaplanır. Taban niteliklerin kaynak büyümesi ve öğrenilmiş yetenek kademesi kullanılır. Bunlar canlı seviye, hasar oranı, tam birleşim veya DPS değildir.
2. Toplam AD taban ve eşya yatırımını, bonus AD yalnız yatırımı kullanır. Parantez içindeki bonus AD koşul sayılmaz. Hedef maksimum/eksik/mevcut can, çok vuruş, saniye başı hasar, saldırı tetiklemesi ve etkinleşme koşulları ayrılır; bilinmeyen kritik/tetikleme kesin toplamına eklenmez.
3. Kayn’ın seçilmeyen biçimleri ana hasara eklenmez. Açık yakın/uzak etiketleri ve Nidalee dönüşüm metni okunur: dört şampiyonda doğrulanmış menzil biçimi vardır. Geri kalanlar tahminle doldurulmaz; kısıtlı eşya izni verilmez. Sabit ritim, mana, vuruş etkisi ve ana düzen kontrolleri korunur.
4. Rakibin kaynak setleri ve referans aşamalarındaki fiziksel/büyü hasar olasılıkları en fazla 18 ayrı uç/sapma senaryosunda karşılaştırılır. Öneri katkısı ortalama ve en düşük senaryoyu birlikte kullanır; bunlar gerçekleşme olasılığı değildir. Kritik/zırh/büyü direnci yatırımı kaynak setinden gerçek alınmış eşya olarak üretilmez.
5. İlk aşamada koridor, sonraki aşamada takım ağırlığı; kaynak satın alma sırasındaki eşya kapsamıyla tam set seçimine katılır. İlk iki ana eşya ve satın alınmış parçalar korunur.
6. Altın/seviye gerektirmeyen üç hazır alışveriş rotası: normal, baskı altında ve uygun erken karşı parça. Tarif ve fiyat bilinmiyorsa kesin parça/tamamlama hesabı yapılmaz. Sapmalar son seçilen sete birleşir; harcanan bütçe açıklanır.
7. Güncel yetenek panelinden kaçınılacak rakip yeteneği, kendi takas fırsatı ve güvenle erişilebilen takım savaşı tehdidi üç kısa kuraldır. Temel beklemeler canlı sayaç olarak gösterilmez.
8. “Hızlı maç” sekmesi altı eşya, sıra, üç kural ve hazır rotaları gösterir. Rün/yetenek paneli son setin altında isteğe bağlı açılır; ayrıntılı eşya ekranında panel doğrudan son set altında açık kalır. Öndeki rakip ve gerçek görülen kritik eşya tek dokunuşla bildirilir; hiçbir eşya önceden gözlem sayılmaz.
9. 7.3a için güncel doğal yetenek kanıtı bulunan şampiyonlarda takım dengesi katkısının yanlışlıkla kapalı kalması düzeltildi. Yakın adaylar ve sınırlı kaynak güveni ayrı açıklanır. Kalite kontrolleri yayımlanan binden fazla karşı seçim çiftinin yönü, çelişki sınırı, tüm kullanılabilir şampiyon/rol setleri, belirsiz koridor ve bilinmeyen envanterleri kapsar.

Son güncellemeler sekmesinde dokuz tamamlanan gelişme; tarih, açıklama ve oyuncuya avantajı olan lacivert/turkuaz/altın kartlarda listelenir. 360 px ve masaüstü görselleri incelendi. Sayısal işlem ve ekran yeni ağ isteği gerektirmez. 142 yetenek paneli gerçekten yeniden kontrol edildi; başarısız panel yok. Önbellek yeniden ayrıştırması gerçek kontrol zamanını değiştirmez. Son resmî yama kontrolü 7.3a; yerel yöntem sürümü 7.

Doğrulama: 196 birim/HTTP testi ve genişletilmiş Wild Rift tarayıcı testi geçti. Hızlı maçtaki isteğe bağlı işaretler, dokuz avantaj kartı, 360 px taşma, kaynak yenileme ve çıkış sınandı. Gerçek Pages paketi entegrasyonu da geçti; canlı yayına ait doğrulama yerel devam kaydında tutulur.

## Yetenek, eşya ve karar modeli — 30 Eylül 2026

20260930-model1: Onaylanan sekiz madde ve istenen yerleşim uygulandı. Rünler, sihirdar büyüleri ve 1–15 yetenek sırası, son altı yuvalı eşya setinin hemen altında bir kez gösterilir.

1. 142 şampiyonun güncel WildRiftFire yetenek panelinden taban hasar, fiziksel/büyü/gerçek hasar kanalları, AP/AD ve diğer doğrulanabilen ölçekler ayrıştırılır. Yetenek iyileşme ölçekleri hasar ölçeği sayılmaz. Motor bu kayıtları kaynak eşya profiliyle birleştirir; birleşik DPS veya gerçek maç hasarı iddiası yoktur. Eksik/koşullu kayıtlar kesin hasar olarak doldurulmaz.
2. Adlandırılmış normal pasifler de ayrıştırılır; tetikleyici, birikim sınırı, bekleme, süre, yakınlık, can eşiği ve aynı hedef koşulları tutulur. Saldırıyla biriken pasifler, bu düzene uygun olmayan şampiyonlarda tam katkı sayılmaz. Şampiyona gerçek uygulanmayan etki hedefe sürekli uygulanmış kabul edilmez.
3. Kayn’ın Gölge Suikastçı ve Rhaast panelleri ayrılır; kaynak seti/biçimi seçilince ilgili yetenekler kullanılır. Saldırı sıfırlama, sabit saldırı ritmi, manasızlık ve Kai’Sa tam eşya gelişimi ana düzen/güçlenme zamanı kurallarıyla korunur. Bilinmeyen menzil sınıfı tahmin edilmez.
4. Rakibin aynı roldeki güncel, geçerli tam kaynak setleri; görülen eşya örtüşmesi ve farklı hasar/oynanış düzeni açısından karşılaştırılır. En fazla üç farklı senaryo ve elle kaynak seçimi vardır. Olası setler alınmış eşya değildir; kritik, can ve direnç yatırımı sadece görülen eşyadan gelir. Senaryo profilleri önbelleklidir; tam set karşılaştırmaları tek tehdit bağlamını paylaşır.
5. Yedi üçüncü aşama botun fiyat/tarif/nitelik zinciri Riot 7.2, 7.2a–e, 7.3 ve 7.3a belgeleriyle kontrol edilir. 7.2e belgesinin gerçek URL'si patch-notes-72e şeklindedir. 10. dakika ve ana bot sahipliği gerekir; aynı yuva içinde yükseltilir. Ana eşya hemen tamamlanabiliyorsa önceliklidir. Bot harcamasının ana eşya rotasına bedeli gösterilir. Alınan yükseltme aynı kartta görünür; tekrar aldırılmaz. Eski/eksik/yeni yama zinciri otomatik yükseltmeyi kapatır.
6. Resmî son yamanın şampiyon/eşya etki listesi ve içerik hash'i tutulur. Eski içerik tarihli etkilenmiş rehber otomatik seçimden çıkarılır; sayfa başlığının yeni olması tek başına yeniden doğrulama değildir. Durum kaynak tablosunda görünür. Etki kapsamı okunamazsa sayfa başlığı temelli rehber otomatik kabul edilmez.
7. Kaynak ve beklenen sınır içeren sürümlü kalite senaryoları tests/fixtures/wild-rift-quality-scenarios.json dosyasında bulunur. Yoğun büyü, kalkanlı takım, gerçek/bilinmeyen kritik yatırımı, Kai’Sa, Jhin ve destek geliri senaryoları; ayrıca eski rehber karantinası, biçimler ve bot zaman/bütçe/yuva kontrolleri eklendi. Oyun sonucuna ait uydurma doğruluk yüzdesi üretilmez.
8. “Bu karar hangi bilgilerle değişebilir?” alanı; rakip biçimi, gerçek direnç satın alımı, önde olan rakip, satın alınmış eşya, maç aşaması ve bot açılma koşullarını açıklar. Koşullar kesin bir sonraki satın alma tahmini değildir.

Doğrulama: 187 birim/HTTP testi, genişletilmiş tarayıcı akışı (aynı yuvada bot yükseltmesi, son set altında tek rün/yetenek paneli, 360 px görünüm, ek seçim ağı isteği yok) ve gerçek Pages paketi entegrasyonu geçti. Mobil rün/yetenek paneli görsel olarak incelendi. Veri: 142 şampiyon, 684 sayısal yetenek hasar kaydı, 93 eşyada yapılandırılmış pasif; 7 bot gelişimi. Paket yaklaşık 3,21 MB ham / 204 KB gzip.

Güncelleyicinin normal bilgisayar akışı ve hedefli yeniden ayrıştırma aynı modeli kullanır; önceki verinin gerçek kontrol tarihleri korunur. GitHub Pages yayın düzeni ve yönetici erişimi korunur. Sayısal veriler kaynak gösterilir; kaynak metinleri topluca kopyalanmaz.

## Kanıt, tam set ve yetenek paketi — 30 Eylül 2026

20260930-evidence1: Onaylanan dokuz başlık uygulandı. Fire istatistikleri 30 Eylül / 7.3a olarak gerçekten yenilendi. WR-META açık rehberleri: 139/142 şampiyonda 175 doğrulanmış altı yuvalı set; 171 setin kendi rünleri ve 170 setin kendi yetenek sırası var. Diğerleri Fire rehberine açık kaynak atfıyla döner. Amumu/Nunu kaynak setindeki Searing Crown ve Twisted Fate setindeki Magnetic Blaster güncel kataloğa alınmadı; bu üç şampiyonda üçüncü tam set kaynağı kapalıdır. Mevcut diğer rehberler kullanılabilir. WR-META karşı seçim kartlarının kapsamı ayrı olarak 142/142'dir.

140 şampiyonda açık JSON'dan lig/rol/tarihli WR-META genel istatistikleri alındı. Veri kümesinin yaması ve maç sayısı belirtilmediği için bu oranlar sıralamaya katılmaz; diğer Çin verileriyle bağımsız örneklem olarak toplanmaz. Veri kartları kaynak yaması, gerçek düzenleme tarihi ve başarılı kontrol tarihini ayrı gösterir. Core dizilimlerinin gömülü 7.3 etiketi korunur; Meta yama etiketi sayfa başlığı olarak işaretlenir, son yamadan eski düzenleme tarihi açıkça gösterilip kaynak tercihi belirsizlik bedeli alır.

142 şampiyonda 715 yetenek kaydı; temel bekleme, kontrol, hareket, gerçek hasar, iyileşme/kalkan ve saldırı etkileşimleri okunur. Referans verilen yetenek adları kontrol uygulaması, rakibin iyileşmesini azaltmak ise şampiyonun kendi iyileşmesi sayılmaz. Güncel panel koridor planına, takım ihtiyacına ve ikili uyuma bağlandı. Temel süreler canlı sayaç değildir. Yakın/uzak sınıfı açık veriyle doğrulanamadığında eksik gösterilir ve kısıtlı otomatik eşyalara izin verilmez. Bu paket tam bir savaş simülasyonu değildir.

49 eşyada kaynak pasif kaydı; 13 pasifte açık süre/birikim/bekleme bilgisi var. İyileşme/kalkan uygulama koşulları, saldırı birikimi ve menzil/alan farkları Türkçe açıklanır. Core tam setlerinin açık kullanım koşulları seçim motoruna bağlıdır; direnç seti için yalnız tank etiketi yeterli değildir, girilen ilgili direnç yatırımı gerekir. Rün değişimi sadece seçilen rehberin açık ikincil yuva çiftiyle, Arındır sadece kaynakta doğrulanan kaldırılabilir kontrol ve kaynak büyü alternatifiyle önerilir. Üçüncü aşama bot gelişimi seçilen son botu takip eder; Riot 7.2 kimlik/10. dakika kuralı referanstır, doğrulanmamış geliştirme fiyatı alışveriş hesabına eklenmez.

Güncelleyicinin normal akışı üçüncü tam set kaynağını korur; Core yenilemesi Meta setlerini silmez. Hatalı rol, URL, yuva, çakışan pasif, bilinmeyen/kaldırılmış eşya veya tekrarlı ek rehber yayın öncesinde dışlanır. Önbellek yeniden ayrıştırılınca özgün kontrol tarihi korunur. Ham kamuya açık kaynak önbelleği, sunucu zaman damgası yokken de sonraki ayrıştırma için tutulur; ağ hatası başarılı kontrol sayılmaz. İçerik hash'i kontrol saatinden etkilenmez. Veri yaklaşık 3,03 MB ham / 188 KB gzip; seçimlerde ek veri isteği yok.

Doğrulama: 172 birim/HTTP testi, üçüncü set seçimi ve Türkçe rünler, 360 px açık veri kartı taşma denetimi dahil tarayıcı akışı, gerçek Pages paketi entegrasyonu geçti. Admin/çıkış, satın alınan eşya, eski veri, hatalı kaynak, bütçe, koridor ve statik yenileme kontrolleri korunur. Canlı yayın doğrulandı: fd17e823007eedeff604163b8e9303408fd9c4d3. Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36719641186 başarılı. Canlı index, app-v2, admin erişimi, ana UI, yeni rün/bot modülü, kaynak arayüzü, kalite kuralları ve JSON veri paketi yerelle SHA-256 eşleşti. Bu doğrulama sonucu yerel devam notudur.

## Baştan kurulan çalışma alanı — 30 Eylül 2026

20260930-workspace2: Önceki renk/kart tasarımının ötesinde içerik yerleşimi yeniden kuruldu. Masaüstünde 360 px seçim rayı ve yanında analiz tuvali var; rol/lig/şampiyon, iki takım ve seçim araçları aynı panelde. Uzun panel kendi içinde kayar. Mobilde panel daraltılabilir; DOM ve seçimler korunur. Bölüm menüsü analiz alanının üstündedir.

Karşı seçim ekranı ilk adayı iki bölümlü geniş karar kartında, diğerlerini iki kartta sunar. Eşya sayfası şampiyon özeti, altı yuvalı envanter ve mevcut alışveriş kararıyla başlar; altın/parça girişi hemen ardından gelir. Kaynak setleri açılır panele taşındı; gelişmiş maç ayarları ve gerekçe incelemesi aşağıdadır. Eşya görevi kart içinde açılabilir, nitelik/satın alma erişimi korunur. Boş eşya ekranında şampiyon seçme çağrısı var. Koçluk, tehditler, kaynaklar ve seçim pencereleri yeni çalışma alanına göre yeniden düzenlendi. Başlık küçültüldü; büyük dekoratif alan kaldırıldı.

Yeni tarayıcı kontrolleri yan panelin masaüstünde analizin yanında olduğunu, son setin gelişmiş kontrollerden önce geldiğini, daraltmanın seçimleri koruduğunu ve bozuk görselde simgelerin kart içinde kaldığını doğrular. Tüm sekmelerin 360 px taşma denetimi, mevcut admin/çıkış, envanter/saklama/alışveriş işlemleri ve gerçek statik uygulama entegrasyonu geçti. Görseller incelendi. Canlı yayın doğrulandı: 8f5ab0fad5cb05d2f92f585c08534252f30e38a5; Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36657346236 başarılı. Canlı index, app-v2, CSS, admin erişimi ve ana UI yerelle SHA-256 eşleşti. Bu sonuç yerel devam notudur.

## Seçim stüdyosu tasarımı — 30 Eylül 2026

20260930-studio1: Wild Rift arayüzü lacivert/turkuaz/altın temayla yenilendi. Geniş masaüstünde iki takım beş koridorlu panoda, bölüm menüsü solda; mobilde iki takım yan yana, eşya kartları tek sütun, yatay bölüm menüsü kaydırılabilir ve yapışkan. Seçim sayıları gerçek dolu yuvalardan gösterilir. Kontrol edilen koridor vurgulanır; ilk öneri, kaynak seti ve alışveriş kararı görsel hiyerarşi kazanır. Kaynak/şampiyon pencereleri, form alanları ve dokunma hedefleri düzenlendi.

Önerilere geç düğmesi aktif analiz bölümüne kaydırır ve klavye odağını taşır; azaltılmış hareket tercihini gözetir. Ek harici yazı tipi/görsel veya seçim ağı isteği yok. 360 px mobilde bütün sekmeler taşma denetimini geçti; gerçek statik uygulama entegrasyonu, admin/çıkış, seçim saklama, eşya işlemleri, yeni geçiş odağı kontrolü başarılı. Masaüstü ve mobil görseller incelendi. Canlı yayın doğrulandı: f90fe116cbcdad416b3875a3b37e1175f0d81f12; Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36656353708 başarılı. Canlı CSS, index, app-v2, admin erişimi ve UI dosyaları yerelle SHA-256 eşleşti. Bu sonuç yerel devam notudur.

## İki ek kritik düzeltme — 30 Eylül 2026

20260930-critical2: Dizilim uyumunda tamamen kaybolan AD/AP/kritik vb. nitelikler artık atlanmaz; bilinen sıfırın tam maliyeti hesaplanır. Eksik veri ve kaynak çelişkisi nitelik bazında belirsizlik maliyeti/açıklaması verir; uydurma sayısal kayıp gösterilmez. Bir nitelikte çelişki diğer doğrulanmış niteliklerin kaybını gizlemez.

Alışveriş tarifinde her fiziksel parça bir kez tüketilir. Aynı parçadan iki tane gereken Phantom Dancer gibi tariflerde tek parçaya sahip olmak ikinci parçanın önerilmesini engellemez. Alternatif alışverişte parça indirim indeksleri gerçek envantere bağlanır; eski iç tarifler yeni parça rotası oluşturamaz. 158 birim/HTTP testi, gerçek Phantom Dancer senaryosu, mobil tarayıcı ve statik uygulama entegrasyonu geçti. Canlı yayın doğrulandı: 9ce1701f1e830bc22d66fbe899133df714826cf2; Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36645833268 başarılı. Canlı index, app-v2, uyum/alışveriş/meta motorları ve ana arayüz yerelle SHA-256 eşleşti. Bu sonuç yerel devam notudur.

## Kritik şampiyon ve eşya paketi — 30 Eylül 2026

Varlık sürümü: 20260930-critical1. WR-META büyük/küçük yama harfi sorunu giderildi; 142/142 şampiyon doğrulandı, 1.137 adet 7.3a ilişki kaydı var. Boş/bozulmuş eşleşme bölümü başarılı tarama sayılmaz. Bağlantı, ayrıştırıcı ve eksik adres durumları ayrılır; kapsam düşüşü uyarılır, başarısız taramada özgün tarih korunur ve eski kayıtlar çift sayılmaz. RiftGG kısmi başarısızlıkları artık kısmi durum gösterir; tarihsel istatistikler güncel puan değildir.

142 şampiyonun kaynak yetenekleri yeniden okundu; 18 şampiyonda doğrudan metinle doğrulanabilen özel mekanik işaretleri, 28 eşyada yapılandırılmış etki koşulları var. Bunlar bütün yetenek/pasiflerin eksiksiz modeli değildir. Jhin sabit saldırı ritmi, Teemo normal saldırı büyü katkısı/kör etme, Varus doğuştan iyileşme azaltma gibi doğrulanmış özellikler hesaba katılır. 7.3a mekanik/ikili koridor kuralları incelendi; sonraki bilinmeyen yamada katkı kapanır. Tetikleyici, menzil/alan ve çok saldırı gerektiren pasiflerde sürekli tam etki varsayılmaz. Menzili bilinmeyen şampiyona yalnız yakın/uzak kullanım şartlı otomatik alternatif eklenmez.

Tam kaynak setleri sıra farkıyla tekrar sayılmaz. Kaynakta doğrulanmış doğal karma/tank alternatifleri kendi nitelik profiliyle ve açık oynanış değişimi bedeliyle değerlendirilir. Taşıyıcıya aşırı savunma yığmanın maliyeti vardır; koridor, öndeki rakip, erişilebilir hedef, takım görevi ve eldeki envanter birlikte korunur. Her eşya için kaynak/rol gerekçesi, ilgili rakip ve değişiklik bedeli gösterilir. Son öneriyi değiştiren kullanıcı girdisi Türkçe açıklanır.

Gerideki koridorda kaynak setinin savunma botu öne alınabilir. Erken direnç parçası yalnız seçilen son setin güncel resmî tarifine bağlanır; bütçe/yuva/eldeki parçalar denetlenir ve ana rotaya dönüş açıklanır. Tam eşya alınabiliyorsa parça önerisiyle geciktirilmez. Riot'un Guinsoo tarifindeki çift artı yazımı, toplam fiyat doğrulaması korunarak çözüldü: 51 resmî tarif. Yama 7.3a; 29 Eylül Fire istatistikleri hâlâ 7.3 ve güncel ara yama istatistiği gibi sunulmaz.

Doğrulama: 152 birim/HTTP testi; 360 tam set ve 360 envanter/aşama senaryosu; 360 px mobil tarayıcı ve gerçek statik uygulama entegrasyonu geçti. Yeni tarayıcı kontrolleri eşya gerekçelerini, değişim nedenini ve 142/142 kapsamını doğrular. Seçimlerde ek veri isteği yok. Yerel 200 motor ölçümünde medyan 1,51 ms / p95 1,99 ms (gerçek telefon ölçümü değildir). Veri gzip yaklaşık 137 KB. Canlı yayın doğrulandı: 4da5008d367d4367ecf13dc86c9a747e4b1eeffc; Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36644604475 başarılı. Canlı index, app-v2, JSON ve sekiz motor/arayüz modülünün SHA-256 değerleri yerelle eşleşti. Bu yayın sonucu yerel devam notudur.

## Meta seti ve alışveriş motoru — 29 Eylül 2026

Varlık sürümü: 20260929-meta1. Tam kaynak setleri otomatik karşılaştırılır; tek sabit şampiyon/rol profiline göre karşı etki, kaybedilen ana nitelikler, vuruş etkisi/güçlendirilmiş saldırı düzeni, kaynak belirsizliği ve eldeki parçaların kullanılabilirliği birlikte puanlanır. En iyi aday ve iki alternatif Türkçe gösterilir; kullanıcı kaynak setini sabitleyebilir. İlk iki ana eşya seçilen tam set içinde korunur; farklı çekirdek gerekiyorsa doğrulanmış başka tam set seçilir. Kaynak değiştirmek satın alınan eşyaları silmez. Uygunsuz envanter sessizce yok sayılmaz.

Alışveriş sırası son altı yuvalı görünümden ayrıdır. Destek gelir eşyası önce gelir; ana eşyalar, savunma botu, esnek karşı eşyaların sırası, güncel altın ve tarif parçaları birlikte ele alınır. Tam eşya alınabiliyorsa gereksiz erken parça önerilmez. Parça alternatifleri tek bütçeyi birden çok kez harcamaz; sonraki alışverişlerin yuvaları parça tüketimiyle hesaplanır. Kai’Sa'nın Wild Rift tam eşya gelişimi, Yun Tal'ın anlık %0 / birikimli en fazla %25 kritiği, birikimli eşya dönüşümleri açıklanır. Rakibin ormancısı ve oyuncunun seçtiği erişilebilir hedef hesaba katılır; eksik rakip eşyaları varsayılmaz.

Veri: Riot 7.3a (29 Eylül), 142 şampiyon, 181 ana rol rehberi; 142 şampiyondan 531 ek tam kaynak seti (önce 83 şampiyondan 222). Bunların 408'i güncellik/uyumluluk ve eşya geçerliliği filtresini geçiyor; hepsi aynı rol veya arketipte kullanılabilir iddiası yok. 150 kullanılabilir Wild Rift eşyası/parçası, 50 resmî tarif. Kaldırılmış ve doğrulanamayan eşyalar kapalı. Core kanonik şampiyon adresleri düzeltildi. İndirme, içerik tarihi, orijinal yama ve incelenen ara yama ayrı tutulur. Core 7.3 kayıtları yalnızca 7.3a'da değişmeyen eşya/şampiyonlarda açık uyumluluk incelemesiyle kullanılabilir; 7.3b ve sonrası otomatik uyumlu sayılmaz. Riot 7.3 + 7.3a belgeleri yeniden alınır; Yun Tal saldırı hızı 35, Ölümün Dansı 3300 ve tarif farkı uygulanır.

29 Eylül kaynak istatistikleri hâlâ 7.3 etiketlidir; 7.3a puanına katılmaz. Diamond/master var; boş challenger/apex için satır üretilmez. İstatistikteki eksik lig tüm eşya/rehber güncellemesini durdurmaz. Kaynak rehberleri, motor uyarlamaları ve gerçek istatistikler farklı şeylerdir; kazanma oranı garantisi veya tam savaş simülasyonu yok.

Doğrulama: 140 birim/HTTP testi, 360 tam set senaryosu, önceki 162 eşya senaryosu; gerçek statik uygulama entegrasyonu ve 360 px mobil tarayıcı testi başarılı. Seçimlerde ek ağ isteği yok. Yerel 200 motor çalıştırması medyan 1,40 ms / p95 2,95 ms; telefon performansı ölçümü değildir. Veri gzip 134.117 bayt. Yayın tamamlandıktan sonra canlı doğrulama aşağıya eklenecek.

## Üçüncü kaynak tam şampiyon kapsamı — 25 Eylül 2026

`20260925-counters2`: WildRiftCore 142/142 şampiyon sayfası doğrulandı. 591 karşı seçim, 227 beceri eşleşmesi ve 428 sinerji: toplam 1.246 kayıt. Eksik şampiyon yok; her olası rol/şampiyon çifti için veri olduğu iddia edilmez. Kaynak dizini kanonik adresleri sağlar (Kai’Sa, Cho’Gath, Nunu & Willump vb.). sup/bot etiketleri ve şampiyon kimliği takma adları çözüldü. Tek rollü şampiyonda partnerin rolünü taşıyan sinerji kartları öznenin rolüne normalleştirildi. Ayrıştırma hatası üç kez olunca tüm kaynağı durduran yanlış sınıflandırma düzeltildi; gerçek 403/429 ve ardışık bağlantı hatalarında bekleme korunuyor. Eski v1 ayrıştırıcı kaynaklı yanlış bekleme, v2 göçünde kaldırıldı.

Tam tarama altı saatlik taze sayfaları yeniden indirmez, tek işçi ve 1,5 saniye aralık kullanır. 48 sayfa sınırı kaldırıldı. Arayüzde güncel doğrulanmış şampiyon kapsamı gösteriliyor. 127 test ve mobil tarayıcı kontrolleri geçti; gzip veri yaklaşık 117 KB. Canlı yayın doğrulandı: cd3d8fd, Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36130251238 başarılı. Index, app-v2, iki UI modülü ve veri JSON SHA-256 eşleşti; canlı kapsam 142/142. Bu son doğrulama yerel devam notudur.

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


Canlı yayın doğrulandı: 8ecdd85a3ef9309a534d8dbabcd79c141c78dace. Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36729227057 başarılı. Canlı 15 dosya (index, uygulama, CSS, yeni motor/arayüz modülleri ve JSON veri paketi) yerelle SHA-256 eşleşti. Bu sonuç yerel devam notudur.

Canlı yayın doğrulaması — 20261001-auto1: cfe68aae3fc776113b1e9c63c368f183e1714910. Pages işi https://github.com/ysf66123/grandchessysf/actions/runs/36781568548 başarılı. Canlı 14 dosya (iki yeni sekme modülü ve JSON dahil) yerel SHA-256 ile eşleşti. Son Pages paketi entegrasyonu geçti. Veri 142 şampiyon / 684 sayısal yetenek paketi / 93 pasif eşya; 3.207.362 bayt ham, 205.397 bayt gzip. Bu satır yayın sonrası yerel devam kanıtıdır.

20261001-interactions1 doğrulaması: 209 birim/HTTP testi, genişletilmiş Wild Rift tarayıcı testi ve gerçek .pages-dist uygulama entegrasyonu geçti. Mobil/masaüstü senaryo ve güncelleme kartları görsel olarak incelendi. Seçimler yeni veri isteği üretmiyor; yönetici erişimi, rün paneli yerleşimi ve çıkış temizliği korundu.

Canlı yayın doğrulandı: 74a08712c87e21fa9fcfdf903d0cf5a432fc5b50. GitHub Pages çalışması 36789202151 başarıyla tamamlandı. 19 kritik canlı dosyanın normalize edilmiş SHA256 değerleri yerel paketle eşleşti (.cache/interactions1-live.json). Sürüm: 20261001-interactions1. Kontrol: 2026-09-30T23:06:21.952Z.


Canlı yayın doğrulaması — 20261001-combat2: Commit 06d5aac5e406a7a6d692e9afa1ff32c205ea26fa. Aynı commit için GitHub Pages başarıyla tamamlandı: https://github.com/ysf66123/grandchessysf/actions/runs/36794632348. 24/24 kritik canlı dosya yerel sürümle SHA-256 (satır sonu normalleştirilmiş) eşleşti. Doğrulama: 2026-10-01T00:08:47.506Z. Bu yayın kanıtı yerel not dosyasına dağıtımdan sonra eklendi; yalnızca not için ikinci yayın yapılmadı.
