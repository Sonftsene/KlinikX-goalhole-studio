/* dupcii — canlı önizleme için tarayıcı içi demo API (sunucu gerektirmez).
   api.php ile aynı işlemleri ve yetki kurallarını taklit eder; veriler bu tarayıcıda saklanır. */
(function () {
  'use strict';
  const KEY = 'nm-demo-v7';
  const fx = (f) => (window.NM_DEMO_FILES && window.NM_DEMO_FILES[f]) || 'fixtures/' + f;
  const fsize = (f, def) => { const u = window.NM_DEMO_FILES && window.NM_DEMO_FILES[f]; return u ? Math.round((u.length - u.indexOf(',') - 1) * 0.75) : def; };
  const ROSTER_FILES = window.NM_DEMO_ROSTERS || [['Yoğun Bakım 3. Basamak', 'ornek-cizelge-kasim-3-basamak.xlsx'], ['Yoğun Bakım 2. Basamak', 'ornek-cizelge-kasim-2-basamak.xlsx']];
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const now = () => fmt(new Date());
  const ago = (h) => fmt(new Date(Date.now() - h * 3600000));
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lower = (s) => String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR');
  const err = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
  const token = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);

  function poster(title, lines, color) {
    const items = lines.map((l, i) => `<g transform="translate(60 ${190 + i * 62})"><rect width="34" height="34" rx="9" fill="${color}" opacity=".15"/><path d="M9 18l6 6 11-12" stroke="${color}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="54" y="24" font-family="Inter,Arial" font-size="22" fill="#0f1b21">${l}</text></g>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${250 + lines.length * 62}" viewBox="0 0 960 ${250 + lines.length * 62}"><rect width="100%" height="100%" fill="#f6faf9"/><rect width="100%" height="120" fill="${color}"/><text x="60" y="76" font-family="Inter,Arial" font-weight="700" font-size="34" fill="#fff">${title}</text>${items}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function seed() {
    const db = {
      seq: 1000,
      settings: { org_name: 'Şehir Hastanesi Yoğun Bakım', registration: 'approval', banner_on: true, banner_text: 'Kalite denetimi: 6 Kasım Cuma 09:30 — acil arabası mühürleri ve buzdolabı ısı takip formlarını kontrol edin.', banner_tone: 'danger', allow_guest: false, auto_post_roster: true, auto_post_required: false, mail_on: true, mail_host: 'smtp.hostinger.com', mail_port: 465, mail_secure: 'ssl', mail_user: 'bildirim@alanadiniz.com', mail_from: 'bildirim@alanadiniz.com', mail_from_name: 'Yoğun Bakım Portalı', events: { notify_post: true, notify_roster: true, notify_pending_post: true, notify_pending_user: true, notify_user_approved: true } },
      units: [{ id: 1, name: 'Yoğun Bakım' }, { id: 2, name: 'Acil Servis' }, { id: 3, name: 'Dahiliye Servisi' }],
      titles: [{ id: 1, name: 'Sorumlu Hemşire' }, { id: 2, name: 'Sorumlu Hemşire Yardımcısı' }, { id: 3, name: 'Eğitim Hemşiresi' }, { id: 4, name: 'Hemşire' }, { id: 5, name: 'Personel' }],
      categories: [
        { id: 1, name: 'Duyurular', icon: 'megaphone', color: 'rose' },
        { id: 2, name: 'Eğitim & Video', icon: 'play', color: 'violet' },
        { id: 3, name: 'Klinik Protokoller', icon: 'stethoscope', color: 'teal' },
        { id: 4, name: 'Belgeler & Formlar', icon: 'file', color: 'sky' },
        { id: 5, name: 'Toplantı Kararları', icon: 'users', color: 'amber' },
      ],
      users: [
        [1, (window.NM_DEMO_ADMIN || {}).name || 'Berna Kaya', (window.NM_DEMO_ADMIN || {}).email || 'berna.kaya@hastane.org', 4, 1, 'admin', 'active', 0.2],
        [2, 'Mehmet Öztürk', 'mehmet.ozturk@hastane.org', 2, 2, 'editor', 'active', 3],
        [3, 'Elif Yılmaz', 'elif.yilmaz@hastane.org', 4, 1, 'member', 'active', 1],
        [4, 'Burak Demir', 'burak.demir@hastane.org', 4, 1, 'member', 'active', 20],
        [5, 'Zeynep Koç', 'zeynep.koc@hastane.org', 4, 1, 'member', 'active', 5],
        [6, 'Seda Nur Aydın', 'seda.aydin@hastane.org', 4, 1, 'member', 'active', 30],
        [7, 'Ayşe Kaya', 'ayse.kaya@hastane.org', 1, 1, 'editor', 'active', 8],
        [8, 'Mert Tan', 'mert.tan@hastane.org', 4, 2, 'member', 'active', 50],
        [9, 'Selin Arslan', 'selin.arslan@gmail.com', 5, 3, 'member', 'pending', null],
        [10, 'Kemal Bulut', 'kemal.bulut@hastane.org', 5, 1, 'member', 'active', 70],
      ].map(([id, name, email, title_id, unit_id, role, status, seen]) => ({ id, name, email, title_id, unit_id, role, status, created_at: ago(24 * 40 + id), last_seen_at: seen === null ? null : ago(seen), has_password: true, pw: 'demo1234' })),
      posts: [], attachments: [], acks: [], views: [], saves: [], rosters: [], roster_files: [],
      me: 1,
    };
    const P = (o) => { const p = { id: ++db.seq, unit_id: null, status: 'published', pinned: false, required: false, reject_reason: null, share_token: null, share_expires: null, ...o }; p.created_at = p.created_at || ago(o.h || 1); p.updated_at = p.created_at; p.published_at = p.status === 'published' ? p.created_at : null; delete p.h; db.posts.push(p); return p; };
    const A = (post, name, mime, size, url) => db.attachments.push({ id: ++db.seq, post_id: post.id, user_id: post.author_id, name, mime, size, url });

    const p1 = P({ title: 'Yüksek riskli ilaçlarda çift kontrol protokolü (güncel)', category_id: 3, author_id: 1, pinned: true, required: true, h: 26,
      body: 'İnsülin, heparin, potasyum klorür ve narkotik analjeziklerin hazırlanması ve uygulanması sırasında iki hemşirenin bağımsız kontrolü ve imzası zorunludur.\n\nKontrol adımları:\n1. Doğru hasta, doğru ilaç, doğru doz, doğru yol, doğru zaman\n2. İkinci hemşire hesaplamayı bağımsız olarak yapar\n3. Her iki hemşire ilaç uygulama formunu imzalar\n\nEkteki kontrol listesini ilaç odasına asınız.' });
    A(p1, 'cift-kontrol-kontrol-listesi.png', 'image/svg+xml', 182000, poster('Çift Kontrol Kontrol Listesi', ['Hasta kimliği iki tanımlayıcı ile doğrulandı', 'İlaç adı ve konsantrasyon okundu', 'Doz hesabı ikinci hemşirece yapıldı', 'Pompa hızı birlikte kontrol edildi', 'Uygulama formu iki imzalı'], '#0b7a75'));
    A(p1, 'cift-kontrol-protokolu.pdf', 'application/pdf', 27045, fx('cift-kontrol-protokolu.pdf'));
    const p2 = P({ title: '6 Kasım Cuma kalite denetimi hazırlıkları', category_id: 1, author_id: 1, pinned: true, required: true, h: 5,
      body: 'Cuma 09:30\'da iç denetim yapılacaktır. Lütfen vardiya teslimlerinde aşağıdakileri kontrol edin:\n\n• Acil arabası mühür ve sayım formu\n• İlaç buzdolabı ısı takip çizelgesi\n• Atık ayrıştırma kutularının doluluk seviyesi\n• Hasta düşme riski değerlendirme formları\n\nSorularınız için Ayşe Hemşire\'ye ulaşabilirsiniz.' });
    const p3 = P({ title: 'Mavi kod ve yeni defibrilatör kullanımı eğitimi', category_id: 2, author_id: 7, required: true, h: 52,
      body: 'Yeni bifazik defibrilatörün ped yerleşimi, enerji seçimi ve olay kayıt formu adımlarını içeren uygulamalı eğitim kaydı. Tüm ekibin izlemesi zorunludur. Süre: 14 dk.' });
    A(p3, 'defibrilator-egitim-ozeti.png', 'image/svg+xml', 96000, poster('Defibrilatör — Hızlı Bakış', ['Pedleri sağ klavikula altı ve sol koltuk altına yerleştirin', 'Erişkin bifazik: 150–200 J', 'Şok öncesi “Herkes uzak!” uyarısı', 'Şok sonrası 2 dk KPR, sonra ritim kontrolü'], '#7b45c4'));
    const p4 = P({ title: 'Ekim ayı hemşirelik toplantısı kararları', category_id: 5, author_id: 1, h: 24 * 5,
      body: 'Alınan kararlar:\n- Nöbet teslim süresi 15 dakika olarak sabitlendi.\n- Order kontrol saatleri 10:00 ve 22:00.\n- Yeni başlayan hemşirelerin oryantasyon programı 2 haftaya çıkarıldı.\n- Bir sonraki toplantı: 1 Aralık, 14:00, eğitim salonu.' });
    A(p4, 'personel-nobet-kasim-2026.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8029, fx('personel-nobet-kasim-2026.xlsx'));
    const p5 = P({ title: 'SVK pansuman değişimi ve enfeksiyon önleme rehberi', category_id: 4, author_id: 3, unit_id: 1, h: 24 * 7,
      body: 'Klorheksidinli pansuman 7 günde bir veya kirlendiğinde değiştirilir. Lümen yıkama protokolü ve kateter ilişkili kan dolaşımı enfeksiyonu önleme kontrol listesi ektedir.' });
    A(p5, 'basinc-yarasi-onleme.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1384, fx('basinc-yarasi-onleme.docx'));
    P({ title: 'Kasım ayı nöbet listesi yayınlandı', category_id: 1, author_id: 2, h: 24 * 3,
      body: 'Kasım ayı nöbet çizelgesi portaldaki “Nöbet çizelgesi” bölümünde yayınlanmıştır. Değişiklik talepleriniz için en geç 3 gün önceden sorumlu hemşirenize başvurunuz.' });
    P({ title: 'Basınç yarası risk değerlendirmesi (Braden) formu', category_id: 4, author_id: 7, h: 24 * 12,
      body: 'Yatışta ve her vardiyada Braden skoru hesaplanmalı, 12 ve altı skorlarda önleme protokolü başlatılmalıdır.' });
    P({ title: 'Nebülizatör temizliği ve hasta yakını bilgilendirme', category_id: 2, author_id: 4, status: 'pending', h: 3,
      body: 'Çocuk hastalarda maske uyumu ve nebülizatör haznesinin her kullanım sonrası dezenfeksiyonunu anlatan 6 dakikalık eğitim içeriği.' });
    P({ title: 'Kan transfüzyonu izlem formu doldurma kılavuzu', category_id: 4, author_id: 5, status: 'pending', h: 20,
      body: 'İlk 15 dakika vital bulgu takibi ve transfüzyon reaksiyonu geliştiğinde doldurulacak bildirim adımları.' });

    // okuma ve görüntüleme kayıtları
    const ack = (p, ids) => ids.forEach((u, i) => { db.acks.push({ post_id: p.id, user_id: u, created_at: ago(i + 1) }); db.views.push({ post_id: p.id, user_id: u }); });
    ack(p1, [1, 2, 3, 5, 7, 10]);
    ack(p2, [1, 7]);
    ack(p3, [1, 2, 4, 7]);
    db.posts.filter((p) => p.status === 'published').forEach((p) => [1, 2, 7].forEach((u) => { if (!db.views.some((v) => v.post_id === p.id && v.user_id === u)) db.views.push({ post_id: p.id, user_id: u }); }));
    db.views = db.views.filter((v) => !(v.user_id === 1 && v.post_id === p3.id));
    db.saves.push({ post_id: p1.id, user_id: 1 }, { post_id: p4.id, user_id: 3 });

    // Excel nöbet listeleri
    const R = (id, name, file, size, h, by) => {
      db.rosters.push({ id, name });
      if (!file) return;
      const att = { id: ++db.seq, post_id: null, roster_id: id, user_id: by, name: file, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size, url: fx(file) };
      db.attachments.push(att);
      db.roster_files.push({ id: ++db.seq, roster_id: id, attachment_id: att.id, user_id: by, created_at: ago(h) });
    };
    ROSTER_FILES.forEach(([name, file], i) => R(i + 1, name, file, fsize(file, 34000), 30 + i * 45, i + 1));
    // Rehber bilgileri
    [[1, '0532 000 00 01', '4410'], [2, '0533 000 00 02', '4411'], [3, '0534 000 00 03', ''], [7, '0535 000 00 07', '4400'], [5, '0536 000 00 05', '']].forEach(([id, phone, ext]) => { const u = db.users.find((x) => x.id === id); if (u) Object.assign(u, { phone, extension: ext }); });
    p5.review_at = ymd(new Date(Date.now() + 9 * 86400000));
    db.templates = [
      ['Denetim duyurusu', 'Tarih/saat: \nDenetlenecek alanlar: \n• Acil arabası mühür ve sayım formu\n• İlaç buzdolabı ısı takip çizelgesi\n• Atık ayrıştırma\n\nLütfen vardiya teslimlerinde kontrol ediniz.', true],
      ['Eğitim duyurusu', 'Konu: \nTarih/saat: \nYer: \nEğitimci: \n\nKatılım zorunludur. Katılamayacak olanların sorumlu hemşireye bildirmesi rica olunur.', true],
      ['Toplantı duyurusu', 'Tarih/saat: \nYer: \nGündem:\n1. \n2. \n\nKatılımınızı rica ederiz.', false],
      ['Nöbet değişikliği', 'Değişiklik: \nTarih: \nGüncel liste Nöbet listeleri bölümündedir.', false],
      ['Malzeme / cihaz bilgilendirmesi', 'Malzeme / cihaz: \nDurum: \nAlternatif: \nTahmini çözüm tarihi: ', false],
      ['Protokol güncellemesi', 'Güncellenen protokol: \nDeğişen maddeler:\n• \n\nEkteki güncel sürümü okuyup onaylayınız.', true],
    ].map(([title, body, required], i) => ({ id: i + 1, title, body, required, category_id: 1 }));
    db.notifs = [];
    const N = (uid, kind, title, body, url, h) => db.notifs.push({ id: ++db.seq, user_id: uid, kind, title, body, url, at: ago(h), read: false });
    db.users.filter((u) => u.status === 'active').forEach((u) => {
      N(u.id, 'roster', `“${ROSTER_FILES[0][0]}” nöbet listesi güncellendi`, 'Güncel listeyi açmak için dokunun.', '#/nobet/1', 30);
      N(u.id, 'post', p2.title, 'Okumanız gereken yeni duyuru', '#/p/' + p2.id, 5);
      N(u.id, 'shift', 'Yarın nöbetiniz var', 'Nöbetlerim sayfasından ayrıntıları görün.', '#/nobetim', 2);
    });
    db.audit = [
      [1, 'login', '', '', 0.2], [1, 'roster.upload', ROSTER_FILES[0][0], ROSTER_FILES[0][1], 30], [1, 'post.publish', p2.title, '', 5], [7, 'post.publish', p3.title, '', 52],
      [1, 'user.approve', 'Kemal Bulut', '', 60], [2, 'post.approve', p4.title, '', 120], [1, 'settings.save', 'Ayarlar', '', 140], [1, 'backup.create', 'Haftalık yedek', '', 150],
    ].map(([uid, action, target, detail, h]) => ({ id: ++db.seq, user_id: uid, action, target, detail, ip: '10.0.0.' + uid, at: ago(h) }));
    db.backups = [{ name: 'nobetmed-yedek-haftalik.zip', size: 412000, at: ago(24 * 3) }];
    db.invites = [];
    Object.assign(db.settings, { push_enabled: true, digest_on: true, digest_hour: 7, shift_remind_on: true, shift_remind_hour: 18, auto_remind_days: 3, review_warn_days: 14, backup_weekly: true, default_notify_mode: 'instant' });
    return db;
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db || !db.users) db = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db, (k, v) => (k === 'blobUrl' ? undefined : v))); } catch (e) { /* kota */ } };
  save();

  const me = () => { const u = db.users.find((x) => x.id === db.me); return u && u.status === 'active' ? u : null; };
  const needUser = () => me() || err('Bu işlem için giriş yapmalısınız.', 401);
  const isPub = (u) => u && (u.role === 'admin' || u.role === 'editor');
  const needPub = () => { const u = needUser(); if (!isPub(u)) err('Bu işlem için yayın yetkisi gerekir.', 403); return u; };
  const needAdmin = () => { const u = needUser(); if (u.role !== 'admin') err('Bu işlem yalnızca yöneticiler içindir.', 403); return u; };
  const userOut = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, title_id: u.title_id, unit_id: u.unit_id, created_at: u.created_at, last_seen_at: u.last_seen_at, has_password: true, email_notify: u.email_notify !== false, notify_mode: u.notify_mode || 'instant', push_on: false, phone: u.phone || null, extension: u.extension || null, avatar: u.avatar || null, must_change: false });
  const audit = (action, target, detail) => { const u = me(); db.audit.unshift({ id: ++db.seq, user_id: u ? u.id : null, action, target: target || '', detail: detail || '', ip: '10.0.0.1', at: now() }); db.audit = db.audit.slice(0, 300); };
  const notify = (users, kind, title, body, url) => users.forEach((u) => db.notifs.unshift({ id: ++db.seq, user_id: u.id, kind, title, body, url, at: now(), read: false }));
  db.shifts = db.shifts || {};
  /* Nöbetler: önizlemede sunucu yok; listeler tarayıcıda okunur (sitede yükleyen yayıncının tarayıcısı okuyup kaydeder) */
  async function ensureShifts() {
    if (typeof extractShifts !== 'function' || typeof loadSheetModel !== 'function') return;
    for (const r of db.rosters) {
      const ro = rosterOut(r);
      if (!ro.file || (db.shifts[r.id] && db.shifts[r.id].file_id === ro.file.id)) continue;
      if (!/\.(xlsx|xlsm|xls|ods|csv)$/i.test(ro.file.name)) continue;
      try {
        const model = await loadSheetModel(ro.file);
        const res = extractShifts(model, { dict: (db.settings.shift_codes && db.settings.shift_codes.length ? db.settings.shift_codes : undefined), fileName: ro.file.name, uploadedAt: ro.file.updated_at });
        if (res && res.ok) db.shifts[r.id] = { file_id: ro.file.id, period: `${res.year}-${pad(res.month)}`, entries: res.entries.map((e) => ({ name: e.name, title: e.title, date: e.date, code: e.code, label: e.label, kind: e.kind, hours: e.hours, start: e.start, end: e.end })) };
      } catch (e) { /* okunamadı */ }
    }
  }
  const allShifts = () => db.rosters.flatMap((r) => { const sh = db.shifts[r.id]; const ro = rosterOut(r); return sh && ro.file && sh.file_id === ro.file.id ? sh.entries.map((e) => ({ ...e, roster_id: r.id, roster: r.name })) : []; });
  const nameMatch = (a, b) => (typeof matchPersonName === 'function' ? matchPersonName(a, b) : lower(a) === lower(b));
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
  const EVENTS = [['notify_post', 'Yeni duyuru / içerik yayınlandığında (ilgili birimdeki herkese)'], ['notify_roster', 'Nöbet listesi güncellendiğinde (herkese)'], ['notify_pending_post', 'Onay bekleyen içerik gönderildiğinde (yönetici ve yayıncılara)'], ['notify_pending_user', 'Yeni üyelik başvurusu geldiğinde (yöneticilere)'], ['notify_user_approved', 'Üyelik onaylandığında (başvuran kişiye)']];
  const mailReady = () => !!db.settings.mail_on && !!db.settings.mail_from;
  const evOn = (k) => mailReady() && db.settings.events[k] !== false;
  const recipients = (exceptId) => db.users.filter((x) => x.status === 'active' && x.id !== exceptId && x.email_notify !== false).length;
  db.mailLog = db.mailLog || [];
  const logMail = (subject, n) => { if (n > 0) db.mailLog.unshift({ id: ++db.seq, to: n + ' alıcı', subject, kind: '', created_at: now(), sent_at: now(), status: 'sent', error: null }); db.mailLog = db.mailLog.slice(0, 40); return n; };
  const adminSettings = () => ({ push_enabled: db.settings.push_enabled !== false, push_ready: true, digest_on: !!db.settings.digest_on, digest_hour: db.settings.digest_hour ?? 7, shift_remind_on: db.settings.shift_remind_on !== false, shift_remind_hour: db.settings.shift_remind_hour ?? 18, auto_remind_days: db.settings.auto_remind_days ?? 3, review_warn_days: db.settings.review_warn_days ?? 14, backup_weekly: db.settings.backup_weekly !== false, default_notify_mode: db.settings.default_notify_mode || 'instant', allow_guest: !!db.settings.allow_guest, auto_post_roster: db.settings.auto_post_roster !== false, auto_post_required: !!db.settings.auto_post_required, mail_on: !!db.settings.mail_on, mail_host: db.settings.mail_host || '', mail_port: db.settings.mail_port || 465, mail_secure: db.settings.mail_secure || 'ssl', mail_user: db.settings.mail_user || '', mail_has_pass: true, mail_from: db.settings.mail_from || '', mail_from_name: db.settings.mail_from_name || '', mail_ready: mailReady(), events: EVENTS.map(([key, label]) => ({ key, label, on: db.settings.events[key] !== false })), queue: { pending: 0, failed: 0, sent_today: db.mailLog.length } });
  const lists = () => ({ categories: db.categories, units: db.units, titles: db.titles });
  const attOut = (a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, url: a.blobUrl || a.url });
  function rosterOut(r) {
    const files = db.roster_files.filter((f) => f.roster_id === r.id).sort((a, b) => b.id - a.id);
    const f = files[0];
    const att = f && db.attachments.find((a) => a.id === f.attachment_id);
    const user = f && db.users.find((u) => u.id === f.user_id);
    const sh = db.shifts && db.shifts[r.id];
    const parsed = sh && att && sh.file_id === att.id;
    return { id: r.id, name: r.name, versions: files.length, file: att ? { ...attOut(att), updated_at: f.created_at, user_name: user ? user.name : null } : null, period: sh ? sh.period : null, parsed_file_id: parsed ? att.id : (sh ? sh.file_id : null), parsed_count: parsed ? sh.entries.length : 0 };
  }
  const rosterList = () => db.rosters.map(rosterOut);
  const canView = (u, p) => isPub(u) || p.author_id === u.id || (p.status === 'published' && (p.unit_id === null || p.unit_id === u.unit_id));
  const visible = (u, p) => p.status === 'published' && (isPub(u) || p.unit_id === null || p.unit_id === u.unit_id);
  const has = (arr, p, u) => arr.some((x) => x.post_id === p.id && x.user_id === u.id);
  const audience = (p) => db.users.filter((u) => u.status === 'active' && (p.unit_id === null || u.unit_id === p.unit_id)).length;
  const attsOf = (id) => db.attachments.filter((a) => a.post_id === id).map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, url: a.blobUrl || a.url }));
  function postOut(p, u) {
    const author = db.users.find((x) => x.id === p.author_id);
    return {
      ...p, review_at: p.review_at || null, excerpt: p.body.replace(/\s+/g, ' ').slice(0, 220), author_name: author ? author.name : 'Silinmiş kullanıcı', author_title_id: author ? author.title_id : null,
      att_count: db.attachments.filter((a) => a.post_id === p.id).length, ack_count: db.acks.filter((a) => a.post_id === p.id).length, audience: audience(p),
      viewed: has(db.views, p, u), saved: has(db.saves, p, u), acked: has(db.acks, p, u),
    };
  }
  function counts(u) {
    const vis = db.posts.filter((p) => visible(u, p));
    const byCat = {};
    let unread = 0;
    vis.filter((p) => !has(db.views, p, u)).forEach((p) => { byCat[p.category_id] = (byCat[p.category_id] || 0) + 1; unread++; });
    return {
      unread, unread_by_cat: byCat, todo: vis.filter((p) => p.required && !has(db.acks, p, u)).length,
      saved: db.saves.filter((s) => s.user_id === u.id).length,
      pending_posts: isPub(u) ? db.posts.filter((p) => p.status === 'pending').length : 0,
      pending_users: u.role === 'admin' ? db.users.filter((x) => x.status === 'pending').length : 0,
      notif_unread: db.notifs.filter((n) => n.user_id === u.id && !n.read).length,
    };
  }
  const sortKey = (p) => p.published_at || p.created_at;

  const H = {
    boot() {
      const u = me();
      const out = { csrf: 'demo', setup_needed: false, me: u ? userOut(u) : null, settings: { org_name: db.settings.org_name, registration: db.settings.registration }, google_client_id: '', upload_max_mb: 0, mail_ready: mailReady(), ...lists() };
      if (u) {
        Object.assign(out.settings, { push_ready: false, shift_codes: db.settings.shift_codes || null, banner_on: db.settings.banner_on, banner_text: db.settings.banner_text, banner_tone: db.settings.banner_tone, allow_guest: !!db.settings.allow_guest, mail_ready: mailReady(), notify_post: evOn('notify_post') });
        out.counts = counts(u);
        out.rosters = rosterList();
        out.people = db.users.filter((x) => x.status === 'active').map((x) => ({ id: x.id, name: x.name, avatar: x.avatar || null, title_id: x.title_id, unit_id: x.unit_id })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      }
      return out;
    },
    'auth.login'(d) {
      const u = db.users.find((x) => x.email === lower(d.email));
      if (!u || d.password !== u.pw) err('E-posta veya şifre hatalı. (Demo şifresi: demo1234)', 401);
      if (u.status === 'pending') err('Hesabınız yönetici onayı bekliyor. Onaylandığında giriş yapabilirsiniz.', 403);
      if (u.status !== 'active') err('Hesabınız devre dışı bırakılmış.', 403);
      db.me = u.id; u.last_seen_at = now(); return {};
    },
    'auth.register'(d) {
      if (db.settings.registration === 'closed') err('Yeni üye kaydı şu anda kapalı.', 403);
      if ((d.name || '').trim().length < 3) err('Ad soyad girin.');
      if ((d.password || '').length < 8) err('Şifre en az 8 karakter olmalıdır.');
      const email = lower(d.email);
      if (db.users.some((u) => u.email === email)) err('Bu e-posta ile zaten bir hesap var.', 409);
      const status = db.settings.registration === 'open' ? 'active' : 'pending';
      const u = { id: ++db.seq, name: d.name.trim(), email, title_id: d.title_id, unit_id: d.unit_id, role: 'member', status, created_at: now(), last_seen_at: null, pw: d.password };
      db.users.push(u);
      if (status === 'active') { db.me = u.id; return { pending: false }; }
      return { pending: true };
    },
    'auth.logout'() { db.me = null; return {}; },
    'auth.forgot'() { if (!mailReady()) err('E-posta gönderimi ayarlanmamış.'); return { message: 'Bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. (Önizlemede gerçek e-posta gönderilmez.)' }; },
    'me.update'(d) {
      const u = needUser();
      if ('notify_mode' in d) { u.notify_mode = ['instant', 'digest', 'off'].includes(d.notify_mode) ? d.notify_mode : 'instant'; return {}; }
      if ('title_id' in d) u.title_id = db.titles.some((t) => t.id === d.title_id) ? d.title_id : null;
      if ('phone' in d || 'extension' in d) { u.phone = String(d.phone || '').replace(/[^0-9+ ()-]/g, '') || null; u.extension = String(d.extension || '').slice(0, 12) || null; if (!('name' in d)) return {}; }
      if ('email_notify' in d) { u.email_notify = !!d.email_notify; if (!('name' in d)) return {}; } if ((d.name || '').trim().length < 3) err('Ad soyad en az 3 karakter olmalıdır.'); u.name = d.name.trim(); return {}; },
    'me.password'(d) { const u = needUser(); if (d.current !== u.pw) err('Mevcut şifre hatalı. (Demo şifresi: demo1234)'); if ((d.password || '').length < 8) err('Şifre en az 8 karakter olmalıdır.'); u.pw = d.password; return {}; },
    counts() { return { counts: counts(needUser()) }; },
    'posts.list'(d) {
      const u = needUser();
      let list;
      if (d.filter === 'mine') list = db.posts.filter((p) => p.author_id === u.id);
      else if (d.filter === 'pending') { if (!isPub(u)) err('Yetkiniz yok.', 403); list = db.posts.filter((p) => p.status === 'pending'); }
      else {
        list = db.posts.filter((p) => visible(u, p));
        if (d.filter === 'unread') list = list.filter((p) => !has(db.views, p, u));
        if (d.filter === 'todo') list = list.filter((p) => p.required && !has(db.acks, p, u));
        if (d.filter === 'saved') list = list.filter((p) => has(db.saves, p, u));
      }
      if (d.category_id) list = list.filter((p) => p.category_id === d.category_id);
      if (d.q) { const q = lower(d.q); list = list.filter((p) => lower(p.title + ' ' + p.body).includes(q)); }
      const pinFirst = (d.filter || 'all') === 'all' && !d.q;
      list.sort((a, b) => (pinFirst ? (b.pinned - a.pinned) : 0) || sortKey(b).localeCompare(sortKey(a)) || b.id - a.id);
      const off = d.offset || 0;
      return { items: list.slice(off, off + 20).map((p) => postOut(p, u)), has_more: list.length > off + 20 };
    },
    'posts.get'(d) {
      const u = needUser();
      const p = db.posts.find((x) => x.id === d.id);
      if (!p || !canView(u, p)) err('İçerik bulunamadı veya erişim yetkiniz yok.', 404);
      if (p.status === 'published' && !has(db.views, p, u)) db.views.push({ post_id: p.id, user_id: u.id });
      const out = postOut(p, u);
      out.attachments = attsOf(p.id);
      const manage = isPub(u) || p.author_id === u.id;
      out.share = manage && p.share_token && (!p.share_expires || p.share_expires > now()) ? { token: p.share_token, expires: p.share_expires } : null;
      if (manage && p.required && p.status === 'published') {
        const aud = db.users.filter((x) => x.status === 'active' && (p.unit_id === null || x.unit_id === p.unit_id));
        out.readers = db.acks.filter((a) => a.post_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => { const x = db.users.find((y) => y.id === a.user_id); return x ? { id: x.id, name: x.name, title_id: x.title_id, at: a.created_at } : null; }).filter(Boolean);
        out.missing = aud.filter((x) => !db.acks.some((a) => a.post_id === p.id && a.user_id === x.id)).map((x) => ({ id: x.id, name: x.name, title_id: x.title_id })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      }
      return { post: out };
    },
    'posts.save'(d) {
      const u = needUser();
      if ((d.title || '').trim().length < 3) err('Başlık en az 3 karakter olmalıdır.');
      if (!(d.body || '').trim()) err('İçerik metni boş olamaz.');
      if (!db.categories.some((c) => c.id === d.category_id)) err('Geçerli bir bölüm seçin.');
      const pub = isPub(u);
      let p;
      if (d.id) {
        p = db.posts.find((x) => x.id === d.id) || err('İçerik bulunamadı.', 404);
        if (!pub && !(p.author_id === u.id && p.status !== 'published')) err('Bu içeriği düzenleme yetkiniz yok.', 403);
        Object.assign(p, { title: d.title.trim(), body: d.body.trim(), category_id: d.category_id, unit_id: d.unit_id, required: !!d.required, review_at: d.review_at || null, updated_at: now(), reject_reason: null });
        if (pub) p.pinned = !!d.pinned; else p.status = 'pending';
      } else {
        p = { id: ++db.seq, review_at: d.review_at || null, title: d.title.trim(), body: d.body.trim(), category_id: d.category_id, unit_id: d.unit_id, author_id: u.id, status: pub ? 'published' : 'pending', pinned: pub && !!d.pinned, required: !!d.required, reject_reason: null, share_token: null, share_expires: null, created_at: now(), updated_at: now(), published_at: pub ? now() : null };
        db.posts.push(p);
        db.views.push({ post_id: p.id, user_id: u.id });
      }
      (d.remove_attachment_ids || []).forEach((id) => { db.attachments = db.attachments.filter((a) => !(a.id === id && a.post_id === p.id)); });
      (d.attachment_ids || []).forEach((id) => { const a = db.attachments.find((x) => x.id === id && x.post_id === null && x.user_id === u.id); if (a) a.post_id = p.id; });
      audit(d.id ? 'post.edit' : p.status === 'published' ? 'post.publish' : 'post.submit', p.title);
      if (!d.id && p.status === 'published') notify(db.users.filter((x) => x.status === 'active' && x.id !== u.id && (p.unit_id === null || x.unit_id === p.unit_id)), 'post', p.title, p.required ? 'Okumanız gereken yeni içerik' : 'Yeni duyuru', '#/p/' + p.id);
      const mailed = !d.id && p.status === 'published' && d.notify !== false && evOn('notify_post') ? logMail((p.required ? 'Okumanız gereken: ' : 'Yeni duyuru: ') + p.title, recipients(u.id)) : 0;
      return { id: p.id, status: p.status, mailed };
    },
    'posts.delete'(d) {
      const u = needUser();
      const p = db.posts.find((x) => x.id === d.id) || err('İçerik bulunamadı.', 404);
      if (!isPub(u) && !(p.author_id === u.id && p.status !== 'published')) err('Bu içeriği silme yetkiniz yok.', 403);
      db.posts = db.posts.filter((x) => x !== p);
      ['attachments', 'acks', 'views', 'saves'].forEach((k) => { db[k] = db[k].filter((x) => x.post_id !== p.id); });
      return {};
    },
    'posts.approve'(d) { needPub(); const p = db.posts.find((x) => x.id === d.id && x.status === 'pending') || err('Onay bekleyen içerik bulunamadı.', 404); Object.assign(p, { status: 'published', published_at: now(), updated_at: now(), reject_reason: null }); return {}; },
    'posts.reject'(d) { needPub(); const p = db.posts.find((x) => x.id === d.id && x.status === 'pending') || err('Onay bekleyen içerik bulunamadı.', 404); Object.assign(p, { status: 'rejected', reject_reason: d.reason || null, updated_at: now() }); return {}; },
    'posts.pin'(d) { needPub(); const p = db.posts.find((x) => x.id === d.id); if (p) p.pinned = !!d.pinned; return {}; },
    'posts.ack'(d) { const u = needUser(); const p = db.posts.find((x) => x.id === d.id); if (!p || !canView(u, p)) err('İçerik bulunamadı.', 404); if (!has(db.acks, p, u)) db.acks.push({ post_id: p.id, user_id: u.id, created_at: now() }); return {}; },
    'posts.bookmark'(d) { const u = needUser(); const p = db.posts.find((x) => x.id === d.id) || err('İçerik bulunamadı.', 404); db.saves = db.saves.filter((s) => !(s.post_id === p.id && s.user_id === u.id)); if (d.saved) db.saves.push({ post_id: p.id, user_id: u.id }); return {}; },
    'posts.share'(d) {
      const u = needUser(); const p = db.posts.find((x) => x.id === d.id);
      if (!p || p.status !== 'published') err('Yalnızca yayınlanmış içerikler paylaşılabilir.');
      if (!isPub(u) && p.author_id !== u.id) err('Paylaşım bağlantısı oluşturma yetkiniz yok.', 403);
      if (!d.days) { p.share_token = null; p.share_expires = null; return { share: null }; }
      p.share_token = token(); p.share_expires = fmt(new Date(Date.now() + Math.min(d.days, 365) * 86400000));
      return { share: { token: p.share_token, expires: p.share_expires } };
    },
    'rosters.list'() { needUser(); return { rosters: rosterList() }; },
    'rosters.save'(d) {
      needPub();
      if ((d.name || '').trim().length < 2) err('Liste adı en az 2 karakter olmalıdır.');
      let id = d.id;
      if (id) (db.rosters.find((r) => r.id === id) || err('Liste bulunamadı.', 404)).name = d.name.trim();
      else { id = ++db.seq; db.rosters.push({ id, name: d.name.trim() }); }
      return { id, rosters: rosterList() };
    },
    'rosters.delete'(d) {
      needPub();
      db.rosters = db.rosters.filter((r) => r.id !== d.id);
      db.roster_files = db.roster_files.filter((f) => f.roster_id !== d.id);
      return { rosters: rosterList() };
    },
    'rosters.upload'(d) {
      const u = needPub();
      const r = db.rosters.find((x) => x.id === d.id) || err('Liste bulunamadı.', 404);
      const a = db.attachments.find((x) => x.id === d.attachment_id && x.user_id === u.id && x.post_id === null) || err('Yüklenen dosya bulunamadı.', 404);
      a.roster_id = r.id;
      db.roster_files.push({ id: ++db.seq, roster_id: r.id, attachment_id: a.id, user_id: u.id, created_at: now() });
      let post_id = null;
      if (db.settings.auto_post_roster !== false) {
        const p = { id: ++db.seq, title: `“${r.name}” nöbet listesi güncellendi`, body: `${u.name} güncel nöbet listesini yükledi.\nDosya: ${a.name}\n\nListeyi açmak için: ${location.href.split('#')[0]}#/nobet/${r.id}`, category_id: 1, unit_id: null, author_id: u.id, status: 'published', pinned: false, required: !!db.settings.auto_post_required, reject_reason: null, share_token: null, share_expires: null, created_at: now(), updated_at: now(), published_at: now() };
        db.posts.push(p); db.views.push({ post_id: p.id, user_id: u.id }); post_id = p.id;
      }
      audit('roster.upload', r.name, a.name);
      notify(db.users.filter((x) => x.status === 'active' && x.id !== u.id), 'roster', `“${r.name}” nöbet listesi güncellendi`, 'Güncel listeyi açmak için dokunun.', '#/nobet/' + r.id);
      const mailed = evOn('notify_roster') ? logMail('Nöbet listesi güncellendi: ' + r.name, recipients(u.id)) : 0;
      return { roster: rosterOut(r), post_id, mailed };
    },
    'rosters.versions'(d) {
      needUser();
      return { versions: db.roster_files.filter((f) => f.roster_id === d.id).sort((a, b) => b.id - a.id).map((f) => {
        const a = db.attachments.find((x) => x.id === f.attachment_id); const user = db.users.find((x) => x.id === f.user_id);
        return { version_id: f.id, ...attOut(a), updated_at: f.created_at, user_name: user ? user.name : null };
      }) };
    },
    'rosters.restore'(d) {
      const u = needPub();
      const f = db.roster_files.find((x) => x.id === d.version_id && x.roster_id === d.id) || err('Sürüm bulunamadı.', 404);
      db.roster_files.push({ id: ++db.seq, roster_id: d.id, attachment_id: f.attachment_id, user_id: u.id, created_at: now() });
      return { roster: rosterOut(db.rosters.find((r) => r.id === d.id)) };
    },
    'admin.users'() {
      needAdmin();
      return { users: db.users.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name, 'tr')).map((u) => ({ ...userOut(u), post_count: db.posts.filter((p) => p.author_id === u.id).length })) };
    },
    'admin.user.save'(d) {
      needAdmin();
      const email = lower(d.email);
      if ((d.name || '').trim().length < 3) err('Ad soyad girin.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('Geçerli bir e-posta adresi girin.');
      if (db.users.some((u) => u.email === email && u.id !== d.id)) err('Bu e-posta başka bir hesapta kullanılıyor.', 409);
      const admins = db.users.filter((u) => u.role === 'admin' && u.status === 'active').length;
      if (d.id) {
        const u = db.users.find((x) => x.id === d.id) || err('Kullanıcı bulunamadı.', 404);
        if (u.role === 'admin' && u.status === 'active' && (d.role !== 'admin' || d.status !== 'active') && admins <= 1) err('Sistemde en az bir aktif yönetici kalmalıdır.');
        Object.assign(u, { name: d.name.trim(), email, role: d.role, status: d.status, title_id: d.title_id, unit_id: d.unit_id });
        if ('phone' in d) Object.assign(u, { phone: d.phone || null, extension: d.extension || null });
        audit('user.edit', u.name);
        return { id: u.id };
      }
      const pw = d.password || token().slice(0, 8);
      if (pw.length < 8) err('Şifre en az 8 karakter olmalıdır.');
      const u = { id: ++db.seq, name: d.name.trim(), email, role: d.role || 'member', status: 'active', title_id: d.title_id, unit_id: d.unit_id, created_at: now(), last_seen_at: null, pw };
      db.users.push(u);
      return { id: u.id, password: d.password ? null : pw };
    },
    'admin.user.resetpw'(d) { needAdmin(); const u = db.users.find((x) => x.id === d.id) || err('Kullanıcı bulunamadı.', 404); u.pw = token().slice(0, 8); return { password: u.pw }; },
    'admin.user.delete'(d) {
      const a = needAdmin();
      if (d.id === a.id) err('Kendi hesabınızı silemezsiniz.');
      db.users = db.users.filter((u) => u.id !== d.id);
      ['acks', 'views', 'saves'].forEach((k) => { db[k] = db[k].filter((x) => x.user_id !== d.id); });
      return {};
    },
    'tax.save'(d) {
      needAdmin();
      const list = db[d.kind] || err('Geçersiz tür.');
      if ((d.name || '').trim().length < 2) err('Ad en az 2 karakter olmalıdır.');
      const vals = { name: d.name.trim() };
      if (d.kind === 'categories') Object.assign(vals, { icon: d.icon, color: d.color });
      if (d.id) Object.assign(list.find((x) => x.id === d.id) || err('Kayıt bulunamadı.', 404), vals);
      else list.push({ id: ++db.seq, ...vals });
      return { id: d.id, ...lists() };
    },
    'tax.delete'(d) {
      needAdmin();
      const list = db[d.kind];
      if (list.length <= 1) err('En az bir kayıt kalmalıdır.');
      if (d.kind === 'categories') { const n = db.posts.filter((p) => p.category_id === d.id).length; if (n) err(`Bu bölümde ${n} içerik var. Önce içerikleri başka bölüme taşıyın veya silin.`); }
      if (d.kind === 'units') { db.users.forEach((u) => { if (u.unit_id === d.id) u.unit_id = null; }); db.posts.forEach((p) => { if (p.unit_id === d.id) p.unit_id = null; }); }
      if (d.kind === 'titles') db.users.forEach((u) => { if (u.title_id === d.id) u.title_id = null; });
      db[d.kind] = list.filter((x) => x.id !== d.id);
      return lists();
    },
    'settings.save'(d) {
      needAdmin();
      const st = db.settings;
      if (d.org_name) st.org_name = d.org_name;
      if (d.registration) st.registration = d.registration;
      ['banner_on', 'allow_guest', 'auto_post_roster', 'auto_post_required', 'mail_on', 'push_enabled', 'digest_on', 'shift_remind_on', 'backup_weekly'].forEach((k) => { st[k] = !!d[k]; });
      ['digest_hour', 'shift_remind_hour', 'auto_remind_days', 'review_warn_days'].forEach((k) => { if (k in d) st[k] = +d[k] || 0; });
      if (d.default_notify_mode) st.default_notify_mode = d.default_notify_mode;
      audit('settings.save', 'Ayarlar');
      ['banner_text', 'banner_tone', 'mail_host', 'mail_secure', 'mail_user', 'mail_from', 'mail_from_name'].forEach((k) => { if (k in d) st[k] = d[k]; });
      if ('mail_port' in d) st.mail_port = +d.mail_port || 465;
      EVENTS.forEach(([k]) => { if (k in d) st.events[k] = !!d[k]; });
      if (st.mail_on && !st.mail_from) err('E-posta bildirimleri için gönderen e-posta adresini girin.');
      return { admin: adminSettings() };
    },
    'settings.get'() { needAdmin(); return { admin: adminSettings() }; },
    'mail.test'() { needAdmin(); logMail('dupcii test e-postası', 1); return { message: 'Önizlemede gerçek e-posta gönderilmez. Sitenizde test e-postası ' + me().email + ' adresine gider.' }; },
    'mail.log'() { needAdmin(); return { log: db.mailLog }; },
    'posts.remind'(d) {
      needPub();
      const p = db.posts.find((x) => x.id === d.id) || err('İçerik bulunamadı.', 404);
      const missing = db.users.filter((x) => x.status === 'active' && (p.unit_id === null || x.unit_id === p.unit_id) && !db.acks.some((a) => a.post_id === p.id && a.user_id === x.id)).length;
      if (!missing) err('Herkes okumuş, hatırlatılacak kimse yok.');
      return { sent: logMail('Hatırlatma: ' + p.title, missing) };
    },
    /* ---- Bildirim merkezi ---- */
    'notif.list'() { const u = needUser(); return { items: db.notifs.filter((n) => n.user_id === u.id).slice(0, 40) }; },
    'notif.read'(d) { const u = needUser(); db.notifs.forEach((n) => { if (n.user_id === u.id && (!d.id || n.id === d.id)) n.read = true; }); return {}; },
    'push.key'() { err('Önizlemede telefon bildirimi yok; sitenizde çalışır.'); },
    'push.test'() { err('Önizlemede telefon bildirimi yok; sitenizde çalışır.'); },
    /* ---- Nöbetler ---- */
    async 'shifts.my'() {
      const u = needUser();
      await ensureShifts();
      const all = allShifts();
      const t = new Date();
      const from = ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to = addDays(ymd(t), 70);
      const entries = all.filter((e) => e.date >= from && e.date <= to && nameMatch(e.name, u.name)).sort((a, b) => a.date.localeCompare(b.date) || String(a.start || '').localeCompare(String(b.start || '')));
      return { entries, has_data: all.length > 0, name: u.name };
    },
    async 'shifts.day'(d) {
      needUser();
      await ensureShifts();
      const all = allShifts();
      const date = d.date || ymd(new Date());
      const prev = addDays(date, -1);
      const users = db.users.filter((x) => x.status === 'active');
      const person = (e) => { const u = users.find((x) => nameMatch(e.name, x.name)); return { name: e.name, title: e.title, user_id: u ? u.id : null, phone: u ? u.phone || null : null, roster: e.roster }; };
      const groups = {};
      all.filter((e) => e.date === date).sort((a, b) => String(a.start || '99').localeCompare(String(b.start || '99')) || a.name.localeCompare(b.name, 'tr')).forEach((e) => {
        const k = e.kind + '|' + e.code;
        (groups[k] = groups[k] || { code: e.code, label: e.label, kind: e.kind, start: e.start, end: e.end, people: [] }).people.push(person(e));
      });
      const out = Object.values(groups).sort((a, b) => (a.kind !== 'shift') - (b.kind !== 'shift') || String(a.start || '99').localeCompare(String(b.start || '99')));
      const carry = all.filter((e) => e.date === prev && e.kind === 'shift' && e.start && e.end && e.end <= e.start).map((e) => ({ ...person(e), code: e.code, end: e.end }));
      return { date, groups: out, carry, has_data: all.length > 0 };
    },
    'rosters.shifts'(d) {
      needPub();
      db.shifts[d.roster_id] = { file_id: d.file_id, period: d.period, entries: (d.entries || []).map((e) => ({ name: e.name, title: e.title, date: e.date, code: e.code, label: e.label, kind: e.kind, hours: e.hours, start: e.start, end: e.end })) };
      audit('roster.parse', 'Liste #' + d.roster_id, `${d.entries.length} nöbet kaydı, dönem ${d.period}`);
      return { saved: db.shifts[d.roster_id].entries.length };
    },
    'rosters.period'(d) {
      needPub();
      const sh = db.shifts[d.id];
      if (sh) { sh.period = d.period; sh.entries = sh.entries.map((e) => ({ ...e, date: d.period + e.date.slice(7) })); }
      audit('roster.period', (db.rosters.find((r) => r.id === d.id) || {}).name, 'Dönem: ' + d.period);
      return { period: d.period };
    },
    async 'people.list'() {
      needUser();
      await ensureShifts();
      const today = ymd(new Date());
      const todays = allShifts().filter((e) => e.date === today);
      return { people: db.users.filter((u) => u.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((u) => {
        const s = todays.find((e) => nameMatch(e.name, u.name));
        return { id: u.id, name: u.name, email: u.email, avatar: u.avatar || null, phone: u.phone || null, extension: u.extension || null, title_id: u.title_id, unit_id: u.unit_id, role: u.role, last_seen_at: u.last_seen_at, today: s ? { code: s.code, label: s.label, kind: s.kind, start: s.start, end: s.end } : null };
      }) };
    },
    /* ---- Raporlar, günlük, yedek ---- */
    'report.reads'() {
      needPub();
      const posts = db.posts.filter((p) => p.status === 'published' && p.required).sort((a, b) => b.published_at.localeCompare(a.published_at));
      const acks = {};
      db.acks.forEach((a) => { if (posts.some((p) => p.id === a.post_id)) (acks[a.post_id] = acks[a.post_id] || {})[a.user_id] = a.created_at; });
      return { posts: posts.map((p) => ({ id: p.id, title: p.title, category: (db.categories.find((c) => c.id === p.category_id) || {}).name, unit_id: p.unit_id, published_at: p.published_at, review_at: p.review_at || null })),
        users: db.users.filter((u) => u.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((u) => ({ id: u.id, name: u.name, email: u.email, title_id: u.title_id, unit_id: u.unit_id })), acks, generated_at: now() };
    },
    'report.reviews'() {
      needPub();
      return { items: db.posts.filter((p) => p.review_at && p.status === 'published').sort((a, b) => a.review_at.localeCompare(b.review_at)).map((p) => ({ id: p.id, title: p.title, review_at: p.review_at, author: (db.users.find((u) => u.id === p.author_id) || {}).name })) };
    },
    'audit.list'(d) {
      needAdmin();
      const q = lower(d.q || '');
      const rows = db.audit.map((x) => ({ ...x, user: (db.users.find((u) => u.id === x.user_id) || {}).name || null })).filter((x) => !q || lower([x.user, x.action, x.target, x.detail].join(' ')).includes(q));
      const off = d.offset || 0;
      return { items: rows.slice(off, off + 50), has_more: rows.length > off + 50 };
    },
    'backup.list'() { needAdmin(); return { items: db.backups, zip: true, weekly: db.settings.backup_weekly !== false, last: db.backups[0] ? db.backups[0].at : null }; },
    'backup.create'() { needAdmin(); db.backups.unshift({ name: 'nobetmed-yedek-' + now().replace(/[: ]/g, '-') + '.zip', size: 380000 + Math.round(Math.random() * 60000), at: now() }); db.backups = db.backups.slice(0, 4); audit('backup.create', 'Elle yedek'); return { items: db.backups }; },
    'backup.delete'(d) { needAdmin(); db.backups = db.backups.filter((b) => b.name !== d.name); return { items: db.backups }; },
    /* ---- Şablonlar ---- */
    'templates.list'() { needUser(); return { items: db.templates }; },
    'templates.save'(d) { needPub(); if ((d.title || '').trim().length < 2 || !(d.body || '').trim()) err('Başlık ve metin gerekli.'); db.templates.push({ id: ++db.seq, title: d.title.trim().slice(0, 80), body: d.body, category_id: d.category_id || null, required: !!d.required }); audit('template.create', d.title); return { items: db.templates }; },
    'templates.delete'(d) { needPub(); db.templates = db.templates.filter((t) => t.id !== d.id); return { items: db.templates }; },
    /* ---- Davetler ---- */
    'invites.general'(d) {
      needAdmin();
      const inv = { id: ++db.seq, token: token(), kind: 'general', unit_id: d.unit_id || null, auto_approve: !!d.auto_approve, uses: 0, max_uses: 500, expires: fmt(new Date(Date.now() + (d.days || 30) * 86400000)), revoked: false };
      db.invites.push(inv);
      audit('invite.general', 'QR davet');
      return { invite: { ...inv, url: location.href.split(/[?#]/)[0] + '?davet=' + inv.token } };
    },
    async 'invites.candidates'() {
      needAdmin();
      await ensureShifts();
      const users = db.users;
      const seen = {};
      allShifts().forEach((e) => { if (!seen[lower(e.name)] && !users.some((u) => nameMatch(e.name, u.name))) seen[lower(e.name)] = { name: e.name, title: e.title }; });
      return { items: Object.values(seen).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((p) => ({ name: p.name, title_id: (db.titles.find((t) => lower(t.name) === lower(p.title || '')) || {}).id || null, invited: db.invites.some((i) => i.kind === 'personal' && lower(i.name) === lower(p.name)) })) };
    },
    'invites.personal'(d) {
      needAdmin();
      const items = (d.people || []).map((p) => {
        const inv = { id: ++db.seq, token: token(), kind: 'personal', name: p.name, email: p.email || null, title_id: p.title_id, unit_id: p.unit_id, auto_approve: true, uses: 0, max_uses: 1, expires: fmt(new Date(Date.now() + 60 * 86400000)), revoked: false };
        db.invites.push(inv);
        return { ...inv, url: location.href.split(/[?#]/)[0] + '?davet=' + inv.token };
      });
      audit('invite.personal', items.length + ' kişi');
      return { items, mailed: items.filter((x) => x.email).length };
    },
    'invite.get'(d) {
      const inv = db.invites.find((i) => i.token === d.token && !i.revoked && i.uses < i.max_uses);
      if (!inv) err('Bu davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş.', 404);
      return { invite: { kind: inv.kind, name: inv.name || '', email: inv.email || '', title_id: inv.title_id || null, unit_id: inv.unit_id || null, auto_approve: inv.auto_approve }, org_name: db.settings.org_name };
    },
    'passkey.list'() { needUser(); return { items: [] }; },
    'me.avatar'(d) {
      const u = needUser();
      let t = u;
      if (d.user_id && d.user_id !== u.id) { if (u.role !== 'admin' || !d.remove) err('Yetkiniz yok.', 403); t = db.users.find((x) => x.id === d.user_id) || err('Kullanıcı bulunamadı.', 404); }
      if (d.remove) { t.avatar = null; return { avatar: null }; }
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(d.data || '') || d.data.length > 600000) err('Geçersiz fotoğraf.');
      u.avatar = d.data;
      return { avatar: u.avatar };
    },
    'me.email'(d) {
      const u = needUser();
      const email = lower(d.email).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('Geçerli bir e-posta adresi girin.');
      if (d.current !== u.pw) err('Şifre hatalı. (Demo şifresi: demo1234)');
      if (db.users.some((x) => x.email === email && x.id !== u.id)) err('Bu e-posta başka bir hesapta kullanılıyor.', 409);
      u.email = email;
      return { email };
    },
    'shiftcodes.save'(d) {
      needAdmin();
      if (d.reset) { db.settings.shift_codes = null; return { codes: null }; }
      const codes = (d.codes || []).filter((c) => String(c.code || '').trim()).map((c) => {
        const kind = ['shift', 'leave', 'off'].includes(c.kind) ? c.kind : 'shift';
        const start = kind === 'shift' && /^\d{2}:\d{2}$/.test(c.start || '') ? c.start : null;
        const end = kind === 'shift' && /^\d{2}:\d{2}$/.test(c.end || '') ? c.end : null;
        let hours = 0;
        if (start && end) { let m = (+end.slice(0, 2) * 60 + +end.slice(3)) - (+start.slice(0, 2) * 60 + +start.slice(3)); if (m <= 0) m += 1440; hours = Math.round(m / 6) / 10; }
        const row = { code: String(c.code).trim().slice(0, 12), label: String(c.label || c.code).trim().slice(0, 40), start, end, hours, kind };
        if (start && end && end <= start) row.nextDay = true;
        if (Array.isArray(c.aliases) && c.aliases.length) row.aliases = c.aliases;
        return row;
      });
      if (!codes.length) err('En az bir kod girin.');
      db.settings.shift_codes = codes;
      db.shifts = {};
      audit('settings.save', 'Nöbet kodları', codes.length + ' kod');
      return { codes };
    },
    async 'setup.status'() {
      needAdmin();
      await ensureShifts();
      const people = [...new Set(allShifts().map((e) => e.name))];
      const users = db.users.filter((u) => u.status === 'active');
      return { status: { mail: mailReady(), cron: false, cron_last: null, roster: db.roster_files.length > 0, parsed: allShifts().length > 0, roster_people: people.length, matched: people.filter((n) => users.some((u) => nameMatch(n, u.name))).length, users: users.length, push: true } };
    },
    'attachments.text'() { return { length: 0 }; },
  };
  // Davetle kayıt: önizlemede auth.register davet kodunu da kabul eder
  const _reg = H['auth.register'];
  H['auth.register'] = (d) => {
    const inv = d.invite && db.invites.find((i) => i.token === d.invite && !i.revoked && i.uses < i.max_uses);
    if (!d.invite) return _reg(d);
    if (!inv) err('Bu davet bağlantısı geçersiz veya kullanılmış.', 404);
    const reg = db.settings.registration;
    db.settings.registration = inv.auto_approve ? 'open' : 'approval';
    try {
      const r = _reg({ ...d, name: inv.kind === 'personal' ? inv.name : d.name, unit_id: inv.unit_id || d.unit_id, title_id: inv.title_id || d.title_id });
      inv.uses++;
      return r;
    } finally { db.settings.registration = reg; }
  };

  window.NM_DEMO_API = {
    async call(action, data) {
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));
      const fn = H[action];
      if (!fn) err('Bu işlem önizlemede desteklenmiyor.', 404);
      const r = await fn(JSON.parse(JSON.stringify(data || {})));
      save();
      return { ok: true, ...r };
    },
    upload(file, onProgress) {
      return new Promise((resolve, reject) => {
        const u = me();
        if (!u) return reject(new Error('Giriş gerekli'));
        let p = 0;
        const t = setInterval(() => {
          p = Math.min(1, p + 0.18 + Math.random() * 0.2);
          onProgress && onProgress(p);
          if (p >= 1) {
            clearInterval(t);
            const a = { id: ++db.seq, post_id: null, user_id: u.id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, url: '', blobUrl: URL.createObjectURL(file) };
            // Görüntüleyici dosyayı doğrudan buradan okur (sayfa güvenlik kuralı blob/data adreslerine erişimi engelleyebilir)
            (window.NM_FILE_REG = window.NM_FILE_REG || {})[a.blobUrl] = file;
            db.attachments.push(a);
            save();
            resolve({ id: a.id, name: a.name, mime: a.mime, size: a.size, url: a.blobUrl });
          }
        }, 160);
      });
    },
    switchUser(id) { db.me = id; save(); },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } db = seed(); save(); },
    users() { return db.users.filter((u) => u.status === 'active'); },
    current() { return db.me; },
  };

  // Önizleme çubuğu: rol değiştirme ve sıfırlama
  function bar() {
    const el = document.createElement('div');
    el.id = 'demoBar';
    el.innerHTML = `<style>
      #demoBar{position:fixed;z-index:50;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:12px;background:#0f1b21;color:#fff;font:600 12px Inter,system-ui,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}
      #demoBar select,#demoBar button{height:30px;border-radius:8px;border:0;background:rgba(255,255,255,.12);color:#fff;font:600 12px Inter,system-ui,sans-serif;padding:0 8px}
      #demoBar select option{color:#0f1b21}
      @media (max-width:900px){#demoBar{right:8px;left:8px;bottom:calc(74px + env(safe-area-inset-bottom));justify-content:space-between}}
      @media print{#demoBar{display:none}}
    </style><span>Önizleme</span><select aria-label="Kullanıcı"></select><button type="button" data-r>Sıfırla</button>`;
    const sel = el.querySelector('select');
    const roleTr = { admin: 'Yönetici', editor: 'Yayıncı', member: 'Üye' };
    const fill = () => {
      sel.innerHTML = '<option value="0">Çıkış yapmış</option>' + window.NM_DEMO_API.users().map((u) => `<option value="${u.id}">${u.name} — ${roleTr[u.role]}</option>`).join('');
      sel.value = String(window.NM_DEMO_API.current() || 0);
    };
    fill();
    sel.addEventListener('focus', fill);
    sel.addEventListener('change', async () => {
      window.NM_DEMO_API.switchUser(+sel.value || null);
      history.replaceState(null, '', '#/');
      if (typeof S !== 'undefined') { S.me = null; S.bannerHidden = false; }
      await start();
    });
    el.querySelector('[data-r]').addEventListener('click', async () => {
      window.NM_DEMO_API.reset();
      fill();
      history.replaceState(null, '', '#/');
      await start();
    });
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
})();
