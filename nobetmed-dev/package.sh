#!/usr/bin/env bash
# Hostinger'a yüklenecek ZIP paketini üretir: ./package.sh [çıktı.zip]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/nobetmed-hostinger.zip}")"
cd "$here/../nobetmed"
rm -f "$out"
zip -r -q "$out" . -x 'data/*.sqlite*' -x 'uploads/2*' -x 'uploads/*.part' -x '.gitignore'
echo "$out"
