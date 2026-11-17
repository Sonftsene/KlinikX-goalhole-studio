#!/usr/bin/env bash
# Hostinger'a yüklenecek ZIP paketini üretir: ./package.sh [çıktı.zip]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/dupcii-hostinger.zip}")"
cd "$here/../nobetmed"
rm -f "$out"
# data/, uploads/ ve config.php pakette yok: güncellemede dosya yöneticisi çakışma yaşamaz, veriler ve ayarlar ezilmez
zip -r -q "$out" . -x 'data' -x 'data/*' -x 'uploads' -x 'uploads/*' -x 'config.php' -x '.gitignore'
echo "$out"
