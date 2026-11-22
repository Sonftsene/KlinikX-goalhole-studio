// Eski iPhone / Safari uyumluluğu (4.31.4): iOS 15 – 16.3'te dosyanın tamamını ya da bir özelliği bozan yazımlar yasak.
// Örn. düzenli ifadede geriye bakma (?<! … ) iOS 16.4 öncesinde sözdizimi hatasıdır: dosya hiç çalışmaz (İstekler sekmesi kayboluyordu).
//   node e2e-uyumluluk.mjs <adres> <çıktı> <site klasörü>
import fs from 'node:fs';
import path from 'node:path';
const SITE = process.argv[4] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'nobetmed');
const files = [...fs.readdirSync(path.join(SITE, 'assets/js')).filter((f) => f.endsWith('.js')).map((f) => path.join(SITE, 'assets/js', f)), path.join(SITE, 'sw.js'), path.join(SITE, 'assets/theme.js')];
const rules = [
  [/\(\?<[=!]/, 'düzenli ifadede geriye bakma (lookbehind) — iOS 16.4'],
  [/\bstatic\s*\{/, 'sınıfta static blok — iOS 16.4'],
  [/\.at\(-?\d/, 'Array/String .at() — iOS 15.4'],
  [/\.findLast(Index)?\(/, 'findLast — iOS 15.4'],
  [/\bstructuredClone\(/, 'structuredClone — iOS 15.4'],
  [/\bObject\.hasOwn\(/, 'Object.hasOwn — iOS 15.4'],
  [/\.to(Sorted|Reversed|Spliced)\(/, 'toSorted / toReversed / toSpliced — iOS 16'],
  [/\b(Object|Map)\.groupBy\(/, 'groupBy — iOS 17.4'],
  [/\bPromise\.withResolvers\(/, 'Promise.withResolvers — iOS 17.4'],
  [/\bArray\.fromAsync\(/, 'Array.fromAsync — iOS 16.4'],
  [/\brequestIdleCallback\(/, 'requestIdleCallback — Safari’de yok (typeof denetimi olmadan)'],
  [/\bcrypto\.randomUUID\(/, 'crypto.randomUUID — iOS 15.4'],
  [/\/[a-z]*v[a-z]*\.(test|exec)\(|new RegExp\([^)]*,\s*'[a-z]*v/, 'düzenli ifadede v bayrağı — iOS 17'],
];
const bad = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, '');
    for (const [re, why] of rules) if (re.test(code) && !/typeof\s+requestIdleCallback/.test(code)) bad.push(`${path.basename(f)}:${i + 1}: ${why}`);
  });
}
if (bad.length) { console.log('✗ eski iOS’ta çalışmayan yazım:\n' + bad.join('\n')); console.log('\nHATALAR: ' + bad.length); process.exit(1); }
console.log(`✓ ${files.length} dosyada eski iPhone (iOS 15 – 16.3) ile uyumsuz yazım yok`);
console.log('\nTAMAM: uyumluluk denetimi geçti');
