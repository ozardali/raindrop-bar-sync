# Raindrop Bar Sync

**Tarayıcınızın yer imleri çubuğu, Raindrop.io sayesinde her tarayıcıda aynı.**

[English](README.md) · **Türkçe** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (BR)](README.pt-BR.md)

Chrome, Edge, Brave, Vivaldi, Helium ve Firefox'un **yerleşik yer imleri çubuğunu** tek bir
Raindrop.io koleksiyonuyla çift yönlü eşitleyen bir tarayıcı eklentisi. Firefox'ta bir yer imi
eklersiniz, bir dakika sonra Chrome'un çubuğunda aynı klasörde ve aynı sırada görünür. Sunucu
olarak Raindrop kullanılır; ayrıca barındırmanız gereken hiçbir şey yoktur.

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="Araç çubuğu penceresi">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="Araç çubuğu penceresi, koyu tema">
</p>

## Neden

- Chrome Sync ve Firefox Sync yalnızca kendi tarayıcı ailesi içinde eşitler.
- Raindrop'un kendi eklentisi yer imlerini Raindrop'a kaydeder ama tarayıcının çubuğuna
  dokunmaz.
- Tarayıcılar arası yer imi eşitleme araçları, sizin kurduğunuz ayrı bir depolama ister
  (Nextcloud, WebDAV, Google Drive…). Zaten Raindrop kullanıyorsanız bu eklenti onu kullanır.

## Özellikler

- Yer imleri çubuğu ve alt klasörleri için **çift yönlü eşitleme**: iki taraftan da ekleme,
  yeniden adlandırma, bağlantı düzenleme, taşıma ve silme.
- Klasörlerle yer imlerinin iç içe sırası dahil **birebir sıra**. Raindrop bunu kendisi
  saklayamadığı için koleksiyonda küçük gizli notlarda tutulur.
- **Son değişiklik kazanır**: yer imi ve alan bazında, değişikliği gerçekten yaptığınız
  zamana göre. Bir tarayıcı günlerce çevrimdışı kalmış olsa bile.
- **Yanlışlıkla hiçbir şey kaybolmaz**: ilk eşitleme yalnızca ekler, bir tarafta silinen bir
  klasöre diğer tarafta bir şey eklendiyse klasör geri gelir, toplu silmeler durup onay ister.
- Her değişiklikten önce bu tarayıcının çubuğunun **yedeği**; tek tıkla geri yüklenir.
- Her değişikliği ve nereden geldiğini ("Firefox kaynağından") gösteren **işlem geçmişi**.
- Koleksiyonla eşitlenen tüm tarayıcıların **cihaz listesi**.
- **Çevrimdışı dostu**: bağlantı yokken yapılan değişiklikler saklanır, bağlantı gelince
  gönderilir.
- Açılır pencere ve ayarlar **16 dilde**, açık ve koyu temalı.
- Sunucu yok, analitik yok; `bookmarks`, `storage`, `alarms` ve `api.raindrop.io` dışında izin
  yok.

![Ayarlar sayfası](docs/images/options.png)

## Kurulum

Eklenti henüz Chrome Web Mağazası'nda ya da addons.mozilla.org'da yok; kaynaktan derleyin.
[Node.js](https://nodejs.org) 20 veya üstü gerekir.

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Chromium tabanlı tarayıcılar**: `chrome://extensions` adresini açın, **Geliştirici modu**nu
açın, **Paketlenmemiş öğe yükle**ye tıklayıp `.output/chrome-mv3` klasörünü seçin.

**Firefox**: `about:debugging#/runtime/this-firefox` adresini açın, **Geçici Eklenti Yükle…**ye
tıklayıp `.output/firefox-mv3/manifest.json` dosyasını seçin. Geçici eklentiler Firefox
kapanınca kaldırılır; kalıcı kurulum için `npm run zip:firefox` çalıştırıp zip dosyasını
[addons.mozilla.org](https://addons.mozilla.org/developers/) üzerinde listelenmeyen eklenti
olarak imzalayın.

## Ayarlama

1. **Önce yer imlerinizi yedekleyin** (yer imi yöneticisi → Dışa aktar). Eşitleme gerçek veri
   üzerinde çalışır.
2. Bu eklentiyi kullandığınız tarayıcılarda yerleşik yer imi eşitlemesini (Chrome Sync /
   Firefox Sync yer imleri) kapatın. Tek çubukta iki eşitleme sistemi çakışır ve kopyalar
   oluşturur.
3. Eklenti simgesine tıklayın → **Ayarlar**.
4. **Raindrop hesabı**: bir test token'ı yapıştırın. Sayfa nasıl alınacağını adım adım
   gösterir: Raindrop → Ayarlar → Entegrasyon → *Yeni uygulama oluştur* → *Test jetonu
   oluştur*. Token yalnızca kendi hesabınıza erişim verir ve süresi dolmaz.
5. **Koleksiyon**: çubuğunuzu yansıtacak koleksiyonu seçin ya da yenisini oluşturun. **Her
   tarayıcıda aynı koleksiyonu** kullanın.
6. Bu kadar. İlk eşitleme iki tarafı birleştirir: iki yönde de eksikleri ekler, hiçbir şey
   silmez.

Bundan sonra tarayıcıda yaptığınız değişiklikler saniyeler içinde Raindrop'a gider, diğer
tarayıcılardan gelenler bir dakika içinde gelir (ayarlanabilir).

## Nasıl çalışır

Her eşitleme üç ağacı karşılaştırır: çubuğun şu anki hali, koleksiyonun şu anki hali ve son
eşitlemede iki tarafın üzerinde anlaştığı hal. Yalnızca bir tarafta değişen şey diğer tarafa
kopyalanır; iki taraf da aynı şeyi değiştirdiyse daha yeni değişiklik kazanır. Birleştirme
mantığı birim, özellik ve rastgele (fuzz) testleri olan saf bir fonksiyondur: yüzlerce
rastgele düzenleme geçmişinin her birinde iki tarafın eşit kaldığı ve yeni hiçbir şeyin
kaybolmadığı kontrol edilir.

Ayrıntılar: [docs/architecture.md](docs/architecture.md). Tasarımın dayandığı, canlı API'ye
karşı doğrulanmış Raindrop API davranışları: [docs/raindrop-api.md](docs/raindrop-api.md)
(İngilizce).

## Sınırlamalar

- Yalnızca yer imleri çubuğu (ve klasörleri) eşitlenir; "Diğer yer imleri" ya da "Mobil"
  eşitlenmez.
- Ayırıcılar (Firefox) eşitlenmez; Raindrop'ta karşılıkları yoktur.
- Raindrop'un kabul etmediği bağlantılar (`javascript:` yer imcikleri, `file:`, `about:`)
  bulundukları tarayıcıda kalır ve asla silinmez.
- Android için Firefox ve Safari desteklenmez.
- Vivaldi ve Brave'in Chrome gibi çalışması beklenir ama henüz test edilmedi.
- Giriş test token'ı ile yapılır; "Raindrop ile giriş yap" (OAuth) sunucu tarafında bir gizli
  anahtar gerektirdiği için uygulanmadı.

## Uyarı

**Bu resmî olmayan bir projedir; Raindrop.io ile bağlantılı değildir ve Raindrop.io tarafından
onaylanmamıştır.**

**Eşitleme iki yerdeki gerçek veriyi değiştirir.** Güvenlik önlemleri (ilk eşitlemede silme
yok, toplu silme duraklatması, yerel yedekler, Raindrop'un çöp kutusu) yer imi kaybını olası
olmaktan çıkarır, imkânsız kılmaz. Geri dönebileceğiniz bir yer imi dışa aktarımı saklayın.

**Garanti yoktur.** Yazılım [MIT lisansı](LICENSE) altında olduğu gibi sunulur.

## Gizlilik

Eklenti yalnızca tek bir sunucuyla konuşur: token'ınızla `api.raindrop.io`. Analitik yok,
üçüncü taraf yok. Neyin nerede saklandığı tam olarak [PRIVACY.md](PRIVACY.md) dosyasında
(İngilizce).

## Çeviriler

Eklenti arayüzü, Raindrop uygulamasının desteklediği 16 dilde kullanılabilir. Bu README en
üstte bağlantısı verilen dillerde mevcuttur. İkisi için de **kaynak İngilizcedir**; bir çeviri
farklılaşırsa İngilizce metin geçerlidir. Bir çeviriyi düzeltmek ya da eklemek için:
[CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Katkıda bulunma

Hata bildirimleri ve pull request'ler memnuniyetle karşılanır. Geliştirme ortamı, testler ve
proje yapısı [CONTRIBUTING.md](CONTRIBUTING.md) dosyasında.

## Lisans

[MIT](LICENSE) © Goksel Ozardali
