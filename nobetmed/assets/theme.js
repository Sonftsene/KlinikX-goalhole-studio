/* dupcii — tema ve görünüm tercihleri sayfa çizilmeden uygulanır (yanıp sönme olmasın) */
(function () {
  var d = document.documentElement;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var t = get('nm-theme');
  function sys() { return mq && mq.matches ? 'dark' : 'light'; }
  d.setAttribute('data-theme', t === 'dark' || t === 'light' ? t : sys());
  if (mq && mq.addEventListener) mq.addEventListener('change', function () {
    var c = get('nm-theme');
    if (c !== 'dark' && c !== 'light') d.setAttribute('data-theme', sys());
  });
  var a = get('nm-accent'); if (a && a !== 'varsayilan') d.setAttribute('data-accent', a);
  if (get('nm-fs') === 'lg') d.classList.add('fs-lg');
  if (get('nm-shape') === 'sharp') d.setAttribute('data-shape', 'sharp');
  if (get('nm-density') === 'compact') d.setAttribute('data-density', 'compact');
  if (get('nm-oled') === '1') d.setAttribute('data-oled', '1');
  // Hız: yazı tipi sayfa çizimini bekletmesin (sonradan yüklenir, o ana dek sistem yazı tipi)
  try {
    var fl = document.createElement('link'); fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(fl);
  } catch (e) { /* */ }
  // Hız: açılış verisi (boot) uygulama dosyaları yüklenirken paralel istenir; main.js start() bunu kullanır
  try {
    var bj = document.getElementById('nm-boot'); var bt = bj ? JSON.parse(bj.textContent) : null;
    if (bt && bt.csrf && !bt.share && window.fetch && !window.NM_DEMO_API) {
      window.NM_BOOT_P = fetch('api.php?action=boot', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': bt.csrf }, body: '{}' })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); })
        .catch(function () { return null; });
    }
  } catch (e) { /* */ }
})();
