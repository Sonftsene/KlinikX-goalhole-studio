(function () {
  var t = null;
  try { t = localStorage.getItem('nm-theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { if (localStorage.getItem('nm-fs') === 'lg') document.documentElement.classList.add('fs-lg'); } catch (e) {}
})();
