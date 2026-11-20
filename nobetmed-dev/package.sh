#!/usr/bin/env bash
# Hostinger'a yüklenecek ZIP paketini üretir: ./package.sh [çıktı.zip]
# PKGDIR=<klasör> verilirse paketlenen (küçültülmüş) dosyalar o klasöre de kopyalanır (pakedin kendisini test etmek için).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/dupcii-hostinger.zip}")"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
# data/, uploads/ ve config.php pakette yok: güncellemede dosya yöneticisi çakışma yaşamaz, veriler ve ayarlar ezilmez
(cd "$here/../nobetmed" && tar cf - --exclude=./data --exclude=./uploads --exclude=./config.php --exclude=./.gitignore .) | (cd "$tmp" && tar xf -)
# Paketteki PHP dosyalarından açıklama ve boşluklar atılır (php -w, PHP'nin kendi ayrıştırıcısıyla; kod aynen kalır).
# Kaynak klasörde açıklamalar durur. İçinde "?>" geçen (HTML karışık) dosyalara ve kullanıcının okuyup düzenlediği
# config.sample.php'ye dokunulmaz.
if command -v php > /dev/null; then
  while IFS= read -r -d '' f; do
    [ "$(basename "$f")" = config.sample.php ] && continue
    grep -q '?>' "$f" && continue
    if php -w "$f" > "$f.min" && php -l "$f.min" > /dev/null 2>&1; then mv "$f.min" "$f"; else rm -f -- "$f.min"; fi
  done < <(find "$tmp" -name '*.php' -print0)
fi
# Paketteki uygulama JS dosyalarından açıklama ve girinti atılır (strip-js.cjs: ayrıştırıcıyla, jeton dizisi aynı kalır).
if command -v node > /dev/null; then node "$here/strip-js.cjs" "$tmp"/assets/js/*.js "$tmp/sw.js" || true; fi
[ -n "${PKGDIR:-}" ] && mkdir -p "$PKGDIR" && cp -a "$tmp/." "$PKGDIR/"
rm -f -- "$out"
cd "$tmp"
zip -9 -r -q "$out" .
# PARTS=1 ile ayrıca iki parça: uygulama + kütüphaneler (assets/vendor; nadiren değişir).
if [ "${PARTS:-}" = 1 ]; then
  base="${out%.zip}"
  rm -f -- "$base-uygulama.zip" "$base-kutuphaneler.zip"
  zip -9 -r -q "$base-uygulama.zip" . -x 'assets/vendor/*'
  zip -9 -r -q "$base-kutuphaneler.zip" assets/vendor
fi
echo "$out"
