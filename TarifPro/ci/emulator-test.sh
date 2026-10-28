#!/usr/bin/env bash
# Emülatörde: duman testi + ekran görüntüleri + release APK ile monkey (çökme) testi
set -u
OUT=ci-out
mkdir -p "$OUT/screens"
PKG=com.tarifpro.app

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

echo "== Debug + test APK kuruluyor"
adb install -r -g apks/app-debug.apk
adb install -r -g apks/app-debug-androidTest.apk
adb logcat -c

echo "== Enstrümantasyon (duman) testi"
adb shell am instrument -w -r -e class com.tarifpro.app.SmokeTest $PKG.test/androidx.test.runner.AndroidJUnitRunner > "$OUT/instrument.txt" 2>&1
cat "$OUT/instrument.txt" | tail -40
adb logcat -d -s SmokeTest:* AndroidRuntime:E > "$OUT/smoke-logcat.txt" || true
adb pull /sdcard/Android/data/$PKG/files/screens "$OUT/" >/dev/null 2>&1 || true
ls -la "$OUT/screens" || true

echo "== Release APK monkey testi"
adb uninstall $PKG.test >/dev/null 2>&1 || true
adb uninstall $PKG >/dev/null 2>&1 || true
adb install -r -g apks/release.apk
adb logcat -c
adb shell monkey -p $PKG --throttle 200 --pct-syskeys 0 --pct-appswitch 5 --ignore-security-exceptions -s 42 -v 1500 > "$OUT/monkey.txt" 2>&1
tail -15 "$OUT/monkey.txt"
adb logcat -d AndroidRuntime:E '*:S' > "$OUT/release-crashes.txt" || true
cat "$OUT/release-crashes.txt" | head -80

RESULT=0
if ! grep -q "OK (" "$OUT/instrument.txt"; then echo "!! Duman testi başarısız"; RESULT=1; fi
if grep -q "FATAL EXCEPTION" "$OUT/release-crashes.txt"; then echo "!! Release APK'da çökme"; RESULT=1; fi
if grep -q "// CRASH" "$OUT/monkey.txt"; then echo "!! Monkey testi çökme buldu"; RESULT=1; fi
echo "$RESULT" > "$OUT/result.txt"
exit 0
