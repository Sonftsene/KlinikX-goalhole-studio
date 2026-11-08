# Soyağacı — Kurulum Rehberi

Bu rehber uygulamayı **gerçek, çok kullanıcılı** hale getirmek içindir.
Kurulum yapılmazsa uygulama **demo modunda** çalışır: her şey yalnızca o tarayıcıda saklanır.

Toplam süre: yaklaşık **20–30 dakika**. Hepsi ücretsizdir.

---

## 1. Supabase projesi aç (veritabanı + giriş sistemi)

1. **supabase.com** adresine gir → **Start your project** → GitHub veya e-posta ile üye ol.
2. **New project** de.
   - Name: `soyagaci`
   - Database Password: güçlü bir şifre yaz ve bir yere kaydet.
   - Region: **Central EU (Frankfurt)** (Türkiye'ye en yakın).
3. Proje hazırlanırken 1–2 dakika bekle.

## 2. Veritabanını kur

1. Sol menüden **SQL Editor** → **New query**.
2. Bu depodaki `soyagaci/supabase/schema.sql` dosyasının **tamamını** kopyala, yapıştır.
3. **Run** düğmesine bas. "Success" yazısını görmelisin.

> Dosya tekrar çalıştırılabilir; güncelleme gelirse aynı şekilde yeniden çalıştırman yeterli. Veriler silinmez.

## 3. Adresleri ve anahtarı al

**Project Settings → API** (veya **Connect**) bölümünden iki bilgiyi kopyala:

| Bilgi | Örnek |
|---|---|
| **Project URL** | `https://abcdxyz.supabase.co` |
| **anon public** anahtarı | `eyJhbGciOi...` (uzun bir metin) |

> `anon` anahtarı herkese açık olabilir, güvenliği veritabanı kuralları sağlar.
> **service_role** anahtarını ASLA hiçbir yere yazma.

## 4. Giriş ayarları

**Authentication → URL Configuration**:

- **Site URL**: uygulamanın adresi, örn. `https://sonftsene.github.io/KlinikX-goalhole-studio/`
- **Redirect URLs**'e şunları ekle:
  - `https://sonftsene.github.io/KlinikX-goalhole-studio/**`
  - (Vercel/Netlify kullanırsan o adres de, örn. `https://soyagaci.vercel.app/**`)
  - Bilgisayarda deneme için: `http://localhost:5173/**`

**Authentication → Providers → Email**: açık kalsın. **Confirm email** açık kalsın
(süper yönetici yetkisi yalnızca doğrulanmış e-postaya verilir).

## 5. Google ile giriş

### 5a. Google tarafı
1. **console.cloud.google.com** → üstten yeni proje oluştur (örn. `Soyagaci`).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → uygulama adı "Soyağacı", destek e-postası `sonft1249@gmail.com`.
   - Kaydet. Yayın durumunu **In production** yap (yoksa yalnızca test kullanıcıları girebilir).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `https://sonftsene.github.io`
   - **Authorized redirect URIs**: `https://<proje-kodun>.supabase.co/auth/v1/callback`
     (Supabase'deki Google ayar sayfasında bu adres hazır yazar, oradan kopyala.)
4. Oluşan **Client ID** ve **Client Secret**'ı kopyala.

### 5b. Supabase tarafı
**Authentication → Providers → Google** → **Enable** → Client ID ve Client Secret'ı yapıştır → **Save**.

## 6. Uygulamayı yayınla

### Seçenek A — GitHub Pages (önerilen, depo zaten hazır)
1. GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public anahtarı
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Environments → github-pages**: "Deployment branches" kuralı yalnızca `main` ise,
   çalışma dalını (`ccr-3307c36c-beayk5`) da ekle **veya** değişiklikleri `main`e birleştir.
4. **Actions** sekmesi → "Soyağacı web (GitHub Pages)" → **Run workflow**.
5. Bitince adres: `https://sonftsene.github.io/KlinikX-goalhole-studio/`

> Secret eklemeden de yayınlanır; o zaman site demo modunda açılır.

### Seçenek B — Vercel veya Netlify
- Depoyu içe aktar → **Root directory**: `soyagaci`
- Build command: `npm run build` · Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Tek sayfa uygulaması yönlendirmesi:
  - **Vercel**: `soyagaci/vercel.json` → `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
  - **Netlify**: `soyagaci/public/_redirects` → `/*  /index.html  200`
- Yeni adresi 4. adımdaki Site URL / Redirect URLs listesine ve Google "JavaScript origins"e ekle.

## 7. İlk giriş ve yönetici

1. Siteyi aç → **Google ile giriş** → `sonft1249@gmail.com` hesabını seç.
2. Bu e-posta **otomatik olarak süper yönetici** olur ve hemen aktiftir.
3. **Yönetim** sekmesinden:
   - Kendi kişi kaydını oluştur ve hesabını ona bağla.
   - Aile üyelerini ekle (veya GEDCOM dosyası içe aktar).
   - **Davetler**'den kod oluşturup akrabalarına gönder.

### Akrabalar nasıl katılır?
- Siteye girip **Google ile** veya e-posta ile kayıt olurlar.
- Davet kodu varsa hesapları hemen açılır ve ağaçtaki kişilerine bağlanır.
- Kod yoksa hesap **onay bekler**; yönetici **Kullanıcılar** sayfasından onaylayıp kişiyle eşleştirir.
- Üyeler varsayılan olarak yalnızca **kendi üst ve alt soylarını** görür; diğer dallar için erişim isterler.

---

## Sık sorulanlar

**Google ile girişte "redirect_uri_mismatch" hatası**
→ Google Console'daki *Authorized redirect URI* tam olarak `https://<proje>.supabase.co/auth/v1/callback` olmalı.

**Girişten sonra boş sayfa / yanlış adrese dönüyor**
→ Supabase *Redirect URLs* listesine sitenin adresini sonunda `/**` ile ekle.

**"Google ile giriş henüz etkinleştirilmemiş" uyarısı**
→ 5b adımı yapılmamış.

**Fotoğraflar nerede saklanıyor?**
→ Supabase Storage içindeki `photos` klasöründe (şema dosyası otomatik oluşturur). Ücretsiz pakette 1 GB alan vardır;
uygulama fotoğrafları yüklemeden önce küçültür.

**Yedek almak**
→ Yönetim → Aktar bölümünden JSON/GEDCOM yedeği indir. Supabase de günlük yedek tutar (ücretli pakette).

**Süper yönetici e-postasını değiştirmek**
→ `schema.sql` içindeki `super_admin_email()` fonksiyonunu ve GitHub secret/ortam değişkeni `VITE_ADMIN_EMAIL`'i değiştirip SQL'i yeniden çalıştır.
