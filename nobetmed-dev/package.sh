#!/usr/bin/env bash
# Hostinger'a yüklenecek ZIP paketini üretir: ./package.sh [çıktı.zip]
# Paket kaynak kodun birebir kopyasıdır (okunur kod; hata günlüğündeki satır numaraları anlamlı kalır). Kurulum belgesi KURULUM.md içindedir.
#   PKGDIR=<klasör>  paketlenen dosyalar o klasöre de kopyalanır (paketin kendisini test etmek için)
#   KUCULT=1         isteğe bağlı: PHP / JS / CSS açıklama ve boşlukları atılır, KURULUM.md zip dışına alınır (boyut sınırı olan
#                    bir gönderim yolu gerekirse; kod davranışı aynıdır, JS'de jeton dizisi denetlenir)
#   PARTS=1          ayrıca iki parça: uygulama + kütüphaneler (assets/vendor)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/dupcii-hostinger.zip}")"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
small="${KUCULT:-0}"
# data/, uploads/ ve config.php pakette yok: güncellemede dosya yöneticisi çakışma yaşamaz, veriler ve ayarlar ezilmez
excl=(--exclude=./data --exclude=./uploads --exclude=./config.php --exclude=./.gitignore)
[ "$small" = 1 ] && excl+=(--exclude=./KURULUM.md)
(cd "$here/../nobetmed" && tar cf - "${excl[@]}" .) | (cd "$tmp" && tar xf -)
if [ "$small" = 1 ]; then
  # PHP: php -w (PHP'nin kendi ayrıştırıcısı). "?>" geçen (HTML karışık) dosyalara ve config.sample.php'ye dokunulmaz.
  if command -v php > /dev/null; then
    while IFS= read -r -d '' f; do
      [ "$(basename "$f")" = config.sample.php ] && continue
      grep -q '?>' "$f" && continue
      if php -w "$f" > "$f.min" && php -l "$f.min" > /dev/null 2>&1; then mv "$f.min" "$f"; else rm -f -- "$f.min"; fi
    done < <(find "$tmp" -name '*.php' -print0)
  fi
  # JS: strip-js.cjs (ayrıştırıcıyla; jeton dizisi aynı kalmazsa dosyaya dokunmaz)
  if command -v node > /dev/null; then node "$here/strip-js.cjs" "$tmp"/assets/js/*.js "$tmp/sw.js" || true; fi
  # CSS: açıklama ve girinti (tırnak içinde "/*" geçen dosyaya dokunulmaz)
  if command -v php > /dev/null; then
    for f in "$tmp"/assets/app.css "$tmp"/assets/css/*.css; do
      [ -f "$f" ] || continue
      grep -qE "[\"'][^\"']*/\*" "$f" && continue
      php -r '$s = file_get_contents($argv[1]); $s = preg_replace("#/\*.*?\*/#s", "", $s); $s = preg_replace("/^[ \t]+|[ \t]+$/m", "", $s); $s = preg_replace("/\n{2,}/", "\n", $s); file_put_contents($argv[1], $s);' "$f"
    done
  fi
  cp "$here/../nobetmed/KURULUM.md" "$(dirname "$out")/KURULUM.md"
fi
[ -n "${PKGDIR:-}" ] && mkdir -p "$PKGDIR" && cp -a "$tmp/." "$PKGDIR/"
rm -f -- "$out"
cd "$tmp"
zip -9 -r -q "$out" .
if [ "${PARTS:-}" = 1 ]; then
  base="${out%.zip}"
  rm -f -- "$base-uygulama.zip" "$base-kutuphaneler.zip"
  zip -9 -r -q "$base-uygulama.zip" . -x 'assets/vendor/*'
  zip -9 -r -q "$base-kutuphaneler.zip" assets/vendor
fi
echo "$out"
