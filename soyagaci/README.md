# Soyağacı — Aile Ağacı Uygulaması

Telefona tam uyumlu, web tabanlı aile soyağacı. Ana ekrana uygulama gibi eklenebilir (PWA).

## Özellikler
- **Ağaç görünümü:** atalar, torunlar, kum saati ve tam aile modları; iki parmakla yakınlaştırma, dalları aç/kapa, "beni bul".
- **Liste görünümü:** sıralama, filtre, nesil gruplama; PDF / Excel (CSV) çıktısı.
- **Renk kodları:** erkek mavi, kadın pembe, vefat gri 🕊, hayatta yeşil nokta, siz altın çerçeve.
- **Profiller:** fotoğraf albümü, doğum/vefat bilgileri, meslek, eğitim, mezar yeri, biyografi, belgeler.
- **Yetkiler:** üyeler yalnızca kendi üst/alt soylarını görür; diğer dallar ve başkalarının bilgi/fotoğraf değişiklikleri **yönetici onayı** ile.
- **Yönetim paneli:** kullanıcılar, onay kuyruğu, davet kodları, değişiklik geçmişi, ayarlar, içe/dışa aktarma (GEDCOM).
- **Premium:** Türkçe akrabalık hesaplayıcı (amca, dayı, hala, teyze, yenge, enişte, kuzen…), hatırlatıcılar, harita, zaman çizelgesi, A4/A3 PDF ve görsel çıktı, karanlık mod, TR/EN.
- **Giriş:** Google ile, e-posta + şifre veya e-posta bağlantısı. `sonft1249@gmail.com` otomatik süper yöneticidir.

## Demo modu
Supabase ayarı yoksa uygulama demo modunda çalışır; veriler yalnızca o tarayıcıda saklanır.
Tüm demo hesaplarının şifresi **`demo1234`**:

| Hesap | Rol |
|---|---|
| sonft1249@gmail.com | Yönetici (demo'da "Google ile giriş" de bu hesaba girer) |
| murat@ornek.com | Aile editörü |
| zehra@ornek.com | Üye |
| defne@ornek.com | Üye |

## Geliştirme
```bash
cd soyagaci
npm install
npm run dev        # http://localhost:5173
npm test           # birim testleri
npm run build      # dist/ klasörüne üretim çıktısı
```

Gerçek (çok kullanıcılı) kurulum için `.env.example` dosyasını `.env` olarak kopyalayıp
`VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini girin.

## Kurulum ve yayın
Adım adım rehber: **[docs/KURULUM.md](docs/KURULUM.md)** (Supabase, Google girişi, GitHub Pages / Vercel).

## Yapı
- `src/repo/local.ts` — demo depolama (IndexedDB)
- `src/repo/supabase.ts` — Supabase bağdaştırıcısı (giriş, veri, fotoğraf)
- `supabase/schema.sql` — tablolar, satır güvenliği (RLS), tetikleyiciler, fotoğraf deposu
- `src/store/useFamily.ts` — uygulama durumu ve iş kuralları
- `src/lib/` — ağaç grafiği, yetkiler, arama, akrabalık, GEDCOM
