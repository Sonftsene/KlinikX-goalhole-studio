#!/usr/bin/env bash
# Hostinger'a yüklenecek ZIP paketini üretir: ./package.sh [çıktı.zip]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/dupcii-hostinger.zip}")"
cd "$here/../nobetmed"
rm -f "$out"
# data/, uploads/ ve config.php pakette yok: güncellemede dosya yöneticisi çakışma yaşamaz, veriler ve ayarlar ezilmez
zip -r -q "$out" . -x 'data' -x 'data/*' -x 'uploads' -x 'uploads/*' -x 'config.php' -x '.gitignore'
# Ayrıca iki parça (dosya gönderim sınırına takılmasın): uygulama + kütüphaneler (assets/vendor; nadiren değişir)
base="${out%.zip}"
rm -f "$base-uygulama.zip" "$base-kutuphaneler.zip"
zip -9 -r -q "$base-uygulama.zip" . -x 'data' -x 'data/*' -x 'uploads' -x 'uploads/*' -x 'config.php' -x '.gitignore' -x 'assets/vendor/*'
zip -9 -r -q "$base-kutuphaneler.zip" assets/vendor
echo "$out"
