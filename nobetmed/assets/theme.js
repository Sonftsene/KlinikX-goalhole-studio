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
})();
