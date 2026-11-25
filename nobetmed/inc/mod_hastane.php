<?php
/**
 * Hastane ortak alanları (4.2): aynı hastanenin birimleri arasında paylaşılan
 *  - telefon rehberi (her numarayı ekleyen birim düzenler/siler; herkes görür),
 *  - belgeler (protokol, talimat, form, duyuru; ekler, isteğe bağlı "okudum").
 * Veriler hastanenin kendi veritabanında (data/h/<id>/) ve dosya klasöründe (uploads/h/<id>/) durur.
 * Bir birim yalnız KENDİ hastanesinin ortak veritabanını açar; başka hastaneye hiçbir yol yoktur.
 * Okuma kayıtlarında kişi adları yalnız kendi birimine gösterilir; diğer birimler sayı görür.
 */
declare(strict_types=1);

const H_SCHEMA = 1;
const H_KINDS = ['protokol' => 'Protokol', 'talimat' => 'Talimat', 'form' => 'Form', 'duyuru' => 'Duyuru', 'diger' => 'Diğer'];

/** Bu birimin hastanesinin ortak veritabanı (çok birimli yapı yoksa null) */
function hdb(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    $pdo = null;
    if (!nm_multi()) return null;
    $t = nm_tenant();
    $hid = (int)($t['hospital_id'] ?? 0);
    if ($hid <= 0) return null;
    $dir = NM_ROOT . '/data/h/' . $hid;
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $nameFile = $dir . '/.dbname.php';
    $name = is_file($nameFile) ? (string)(include $nameFile) : '';
    if (!preg_match('/^h-[a-f0-9]{24}\.sqlite$/', $name)) {
        $name = 'h-' . bin2hex(random_bytes(12)) . '.sqlite';
        file_put_contents($nameFile, "<?php return '$name';\n", LOCK_EX);
        $name = (string)(include $nameFile);
    }
    $p = new PDO('sqlite:' . $dir . '/' . $name, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $p->exec('PRAGMA journal_mode = WAL');
    $p->exec('PRAGMA busy_timeout = 5000');
    $v = 0;
    try { $v = (int)$p->query("SELECT v FROM h_settings WHERE k = 'schema'")->fetchColumn(); } catch (Throwable $e) { $v = 0; }
    if ($v < H_SCHEMA) {
        $p->exec('CREATE TABLE IF NOT EXISTS h_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
        $p->exec("CREATE TABLE IF NOT EXISTS h_phonebook (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, number TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
            pinned INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, tkey TEXT NOT NULL, unit_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
        $p->exec("CREATE TABLE IF NOT EXISTS h_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'protokol',
            tkey TEXT NOT NULL, unit_name TEXT NOT NULL DEFAULT '', author_name TEXT NOT NULL DEFAULT '', ack INTEGER NOT NULL DEFAULT 0, review_at TEXT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        $p->exec('CREATE TABLE IF NOT EXISTS h_files (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL, name TEXT NOT NULL, stored TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL)');
        $p->exec('CREATE TABLE IF NOT EXISTS h_reads (doc_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL, read_at TEXT NOT NULL, ack_at TEXT NULL, PRIMARY KEY (doc_id, tkey, user_id))');
        $p->exec('CREATE INDEX IF NOT EXISTS h_files_doc ON h_files (doc_id)');
        $p->prepare("INSERT OR REPLACE INTO h_settings (k, v) VALUES ('schema', ?)")->execute([(string)H_SCHEMA]);
    }
    $pdo = $p;
    return $pdo;
}

function h_q(string $sql, array $p = []): PDOStatement { $st = hdb()->prepare($sql); $st->execute($p); return $st; }
function h_one(string $sql, array $p = []): ?array { $r = h_q($sql, $p)->fetch(); return $r === false ? null : $r; }
function h_all(string $sql, array $p = []): array { return h_q($sql, $p)->fetchAll(); }
function h_val(string $sql, array $p = []) { $r = h_q($sql, $p)->fetchColumn(); return $r === false ? null : $r; }
function h_tkey(): string { return (string)nm_tenant()['tkey']; }
function h_unit_name(): string { nm_tenant_fix_placeholder(); return (string)nm_tenant()['name']; }

function h_upload_dir(): string
{
    $d = NM_ROOT . '/uploads/h/' . (int)nm_tenant()['hospital_id'];
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}

/* =================================================================== */
/* Ortak telefon rehberi                                               */
/* =================================================================== */

/** Hastane numaraları (istemciye negatif kimlikle: birim numaralarıyla karışmaz) */
function hpb_items(): array
{
    if (!hdb()) return [];
    $me = h_tkey();
    return array_map(fn($r) => ['id' => -(int)$r['id'], 'name' => $r['name'], 'number' => $r['number'], 'category' => (string)$r['category'], 'note' => (string)$r['note'],
        'pinned' => (bool)$r['pinned'], 'scope' => 'hastane', 'own' => $r['tkey'] === $me, 'unit' => $r['unit_name']], h_all('SELECT * FROM h_phonebook ORDER BY sort, id'));
}

/** Hastane numarası: yalnız ekleyen birim düzenler/siler */
function hpb_own(int $hid): array
{
    $r = h_one('SELECT * FROM h_phonebook WHERE id = ?', [$hid]) ?? fail('Bu kayıt silinmiş ya da değişmiş olabilir. Sayfayı yenileyin.', 404);
    if ($r['tkey'] !== h_tkey()) fail('Bu numarayı “' . $r['unit_name'] . '” birimi ekledi; yalnız o birim düzenleyebilir.', 403);
    return $r;
}

/** phonebook.save: hastane kapsamı (yeni / düzenle / birimden hastaneye / hastaneden birime taşı) */
function hpb_save(array $me, ?int $id, array $row): bool
{
    $scope = s('scope', 10);
    if (!hdb()) return false;
    [$name, $num, $cat, $note, $pin] = $row;
    if ($id !== null && $id < 0) {
        $r = hpb_own(-$id);
        if ($scope === 'birim') { // hastaneden birime al
            h_q('DELETE FROM h_phonebook WHERE id = ?', [$r['id']]);
            q('INSERT INTO phonebook (name, number, category, note, pinned, updated_by, updated_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$name, $num, $cat, $note, $pin, $me['id'], now(), (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM phonebook')]);
            audit($me, 'phonebook.save', $name, 'Hastane rehberinden birime alındı');
            return true;
        }
        h_q('UPDATE h_phonebook SET name = ?, number = ?, category = ?, note = ?, pinned = ?, unit_name = ?, updated_at = ? WHERE id = ?', [$name, $num, $cat, $note, $pin, h_unit_name(), now(), $r['id']]);
        audit($me, 'phonebook.save', $name, 'Hastane rehberi: ' . $num);
        return true;
    }
    if ($scope !== 'hastane') return false;
    if ($id) { // birim numarasını hastaneye taşı
        if (!one('SELECT id FROM phonebook WHERE id = ?', [$id])) fail('Bu kayıt silinmiş ya da değişmiş olabilir. Sayfayı yenileyin.', 404);
        q('DELETE FROM phonebook WHERE id = ?', [$id]);
    }
    h_q('INSERT INTO h_phonebook (name, number, category, note, pinned, sort, tkey, unit_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, $num, $cat, $note, $pin, (int)h_val('SELECT COALESCE(MAX(sort), 0) + 1 FROM h_phonebook'), h_tkey(), h_unit_name(), now()]);
    audit($me, $id ? 'phonebook.save' : 'phonebook.create', $name, 'Hastane rehberi: ' . $num);
    return true;
}

function hpb_delete(array $me, int $id): void
{
    $r = hpb_own(-$id);
    h_q('DELETE FROM h_phonebook WHERE id = ?', [$r['id']]);
    audit($me, 'phonebook.delete', $r['name'], 'Hastane rehberi: ' . $r['number']);
}

/** Toplu ekleme hastane rehberine; "değiştir" yalnız bu birimin eklediklerini siler */
function hpb_import(array $me, array $clean, bool $replace): int
{
    $pdo = hdb();
    $pdo->beginTransaction();
    try {
        if ($replace) h_q('DELETE FROM h_phonebook WHERE tkey = ?', [h_tkey()]);
        $seen = [];
        foreach (h_all('SELECT name, number, category FROM h_phonebook') as $r) $seen[tr_lower($r['name']) . '|' . $r['number'] . '|' . tr_lower((string)$r['category'])] = 1;
        $sort = (int)h_val('SELECT COALESCE(MAX(sort), 0) FROM h_phonebook');
        $added = 0;
        foreach ($clean as [$name, $num, $cat, $note]) {
            $k = tr_lower($name) . '|' . $num . '|' . tr_lower($cat);
            if (isset($seen[$k])) continue;
            $seen[$k] = 1;
            h_q('INSERT INTO h_phonebook (name, number, category, note, pinned, sort, tkey, unit_name, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)', [$name, $num, $cat, $note, ++$sort, h_tkey(), h_unit_name(), now()]);
            $added++;
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    audit($me, 'phonebook.import', 'Hastane rehberi', $added . ' numara');
    return $added;
}

/** Yönetici: birimin tüm numaralarını hastane rehberine taşı (tekrarlar atlanır) */
function a_phonebook_share(): void
{
    $me = need_admin();
    if (!hdb()) fail('Hastane rehberi bu kurulumda yok.', 400);
    $rows = all('SELECT * FROM phonebook ORDER BY sort, id');
    if (!$rows) fail('Taşınacak birim numarası yok.');
    $seen = [];
    foreach (h_all('SELECT name, number FROM h_phonebook') as $r) $seen[tr_lower($r['name']) . '|' . $r['number']] = 1;
    $sort = (int)h_val('SELECT COALESCE(MAX(sort), 0) FROM h_phonebook');
    $moved = 0;
    hdb()->beginTransaction();
    try {
        foreach ($rows as $r) {
            $k = tr_lower($r['name']) . '|' . $r['number'];
            if (!isset($seen[$k])) {
                h_q('INSERT INTO h_phonebook (name, number, category, note, pinned, sort, tkey, unit_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$r['name'], $r['number'], $r['category'], $r['note'], (int)$r['pinned'], ++$sort, h_tkey(), h_unit_name(), now()]);
                $seen[$k] = 1;
                $moved++;
            }
        }
        hdb()->commit();
    } catch (Throwable $e) { hdb()->rollBack(); throw $e; }
    q('DELETE FROM phonebook');
    audit($me, 'phonebook.share', 'Hastane rehberi', $moved . ' numara taşındı');
    a_phonebook_list();
}

/* =================================================================== */
/* Hastane belgeleri                                                    */
/* =================================================================== */

function hdoc_need(): void
{
    if (!hdb()) fail('Hastane belgeleri bu kurulumda yok.', 400);
}

function hdoc_out(array $d, int $uid, bool $full = false): array
{
    $tk = h_tkey();
    $r = h_one('SELECT read_at, ack_at FROM h_reads WHERE doc_id = ? AND tkey = ? AND user_id = ?', [$d['id'], $tk, $uid]);
    $o = ['id' => (int)$d['id'], 'title' => $d['title'], 'kind' => $d['kind'], 'kind_label' => H_KINDS[$d['kind']] ?? 'Diğer', 'unit' => $d['unit_name'],
        'author' => $d['author_name'], 'own' => $d['tkey'] === $tk, 'ack' => (int)$d['ack'] === 1, 'review_at' => $d['review_at'],
        'created_at' => $d['created_at'], 'updated_at' => $d['updated_at'], 'read' => (bool)$r, 'acked' => $r && $r['ack_at'],
        'files' => (int)h_val('SELECT COUNT(*) FROM h_files WHERE doc_id = ?', [$d['id']])];
    if ($full) {
        $o['body'] = $d['body'];
        $o['attachments'] = array_map(fn($f) => ['id' => (int)$f['id'], 'name' => $f['name'], 'mime' => $f['mime'], 'size' => (int)$f['size'], 'url' => 'api.php?action=hfile&id=' . (int)$f['id'] . nm_link_param()],
            h_all('SELECT * FROM h_files WHERE doc_id = ? ORDER BY id', [$d['id']]));
    }
    return $o;
}

function a_hdoc_list(): void
{
    $me = need_user();
    hdoc_need();
    $rows = h_all('SELECT * FROM h_docs ORDER BY updated_at DESC, id DESC LIMIT 500');
    out(['items' => array_map(fn($d) => hdoc_out($d, (int)$me['id']), $rows), 'kinds' => H_KINDS, 'hospital' => (string)(nm_tenant()['hospital_name'] ?? '')]);
}

function a_hdoc_get(): void
{
    $me = need_user();
    hdoc_need();
    $d = h_one('SELECT * FROM h_docs WHERE id = ?', [(int)i('id')]) ?? fail('Belge bulunamadı.', 404);
    // Açınca okundu sayılır (onay ayrı)
    h_q('INSERT OR IGNORE INTO h_reads (doc_id, tkey, user_id, name, read_at) VALUES (?, ?, ?, ?, ?)', [$d['id'], h_tkey(), $me['id'], $me['name'], now()]);
    out(['doc' => hdoc_out($d, (int)$me['id'], true)]);
}

function a_hdoc_ack(): void
{
    $me = need_user();
    hdoc_need();
    $d = h_one('SELECT * FROM h_docs WHERE id = ?', [(int)i('id')]) ?? fail('Belge bulunamadı.', 404);
    h_q('INSERT OR IGNORE INTO h_reads (doc_id, tkey, user_id, name, read_at) VALUES (?, ?, ?, ?, ?)', [$d['id'], h_tkey(), $me['id'], $me['name'], now()]);
    h_q('UPDATE h_reads SET ack_at = COALESCE(ack_at, ?), name = ? WHERE doc_id = ? AND tkey = ? AND user_id = ?', [now(), $me['name'], $d['id'], h_tkey(), $me['id']]);
    out(['ok' => true]);
}

/** Yayınla / düzenle: yalnız belgeyi ekleyen birimin yetkilileri. Ekler birimin yüklemesinden hastane klasörüne taşınır. */
function a_hdoc_save(): void
{
    $me = need_publisher();
    hdoc_need();
    $title = s('title', 200);
    if (mb_strlen($title) < 3) fail('Başlık en az 3 karakter olmalı.');
    $kind = array_key_exists(s('kind', 20), H_KINDS) ? s('kind', 20) : 'protokol';
    $body = s('body', 60000);
    $review = s('review_at', 10);
    if ($review !== '' && !valid_ymd($review)) $review = '';
    $id = (int)(i('id') ?? 0);
    if ($id) {
        $d = h_one('SELECT * FROM h_docs WHERE id = ?', [$id]) ?? fail('Belge bulunamadı.', 404);
        if ($d['tkey'] !== h_tkey()) fail('Bu belgeyi “' . $d['unit_name'] . '” birimi yayımladı; yalnız o birim düzenleyebilir.', 403);
        h_q('UPDATE h_docs SET title = ?, body = ?, kind = ?, ack = ?, review_at = ?, unit_name = ?, updated_at = ? WHERE id = ?', [$title, $body, $kind, b('ack') ? 1 : 0, $review ?: null, h_unit_name(), now(), $id]);
        foreach (array_map('intval', arr('remove_files')) as $fid) {
            $f = h_one('SELECT * FROM h_files WHERE id = ? AND doc_id = ?', [$fid, $id]);
            if ($f) { @unlink(h_upload_dir() . '/' . $f['stored']); h_q('DELETE FROM h_files WHERE id = ?', [$fid]); }
        }
        if (b('reset_reads')) h_q('UPDATE h_reads SET ack_at = NULL WHERE doc_id = ?', [$id]);
    } else {
        h_q('INSERT INTO h_docs (title, body, kind, tkey, unit_name, author_name, ack, review_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$title, $body, $kind, h_tkey(), h_unit_name(), $me['name'], b('ack') ? 1 : 0, $review ?: null, now(), now()]);
        $id = (int)hdb()->lastInsertId();
    }
    // Yeni ekler: kişinin kendi yüklediği, henüz bağlanmamış birim dosyaları
    foreach (array_slice(array_map('intval', arr('att_ids')), 0, 30) as $aid) {
        $a = one('SELECT * FROM attachments WHERE id = ? AND user_id = ? AND post_id IS NULL AND roster_id IS NULL', [$aid, $me['id']]);
        if (!$a) continue;
        $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
        if (!@rename(nm_upload_dir() . '/' . $a['stored_name'], h_upload_dir() . '/' . $stored)) continue;
        h_q('INSERT INTO h_files (doc_id, name, stored, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$id, $a['orig_name'], $stored, $a['mime'], (int)$a['size'], now()]);
        q('DELETE FROM attachments WHERE id = ?', [$aid]);
    }
    audit($me, i('id') ? 'hdoc.save' : 'hdoc.create', $title, H_KINDS[$kind]);
    // Yeni belge: hastanenin diğer birimlerine hemen bildir (zamanlanmış görevi beklemeden)
    if (!i('id') && function_exists('nb_kick')) {
        $hid = (int)nm_tenant()['hospital_id'];
        nb_kick(array_map(fn($t) => (string)$t['tkey'], array_filter(nm_tenants(), fn($t) => (int)$t['hospital_id'] === $hid)), 'hdoc_notify');
    }
    out(['doc' => hdoc_out(h_one('SELECT * FROM h_docs WHERE id = ?', [$id]), (int)$me['id'], true)]);
}

function a_hdoc_delete(): void
{
    $me = need_publisher();
    hdoc_need();
    $d = h_one('SELECT * FROM h_docs WHERE id = ?', [(int)i('id')]) ?? fail('Belge bulunamadı.', 404);
    if ($d['tkey'] !== h_tkey()) fail('Bu belgeyi yalnız yayımlayan birim silebilir.', 403);
    foreach (h_all('SELECT stored FROM h_files WHERE doc_id = ?', [$d['id']]) as $f) @unlink(h_upload_dir() . '/' . $f['stored']);
    h_q('DELETE FROM h_files WHERE doc_id = ?', [$d['id']]);
    h_q('DELETE FROM h_reads WHERE doc_id = ?', [$d['id']]);
    h_q('DELETE FROM h_docs WHERE id = ?', [$d['id']]);
    audit($me, 'hdoc.delete', $d['title']);
    out();
}

/**
 * Okuma raporu (yönetenler): kendi biriminin kişileri adıyla (okuyan / okumayan),
 * diğer birimler yalnız sayıyla (KVKK: başka birimin personel adları gösterilmez).
 */
function a_hdoc_report(): void
{
    need_publisher();
    hdoc_need();
    $d = h_one('SELECT * FROM h_docs WHERE id = ?', [(int)i('id')]) ?? fail('Belge bulunamadı.', 404);
    $mine = [];
    foreach (h_all('SELECT user_id, read_at, ack_at FROM h_reads WHERE doc_id = ? AND tkey = ?', [$d['id'], h_tkey()]) as $r) $mine[(int)$r['user_id']] = $r;
    $people = array_map(fn($u) => ['name' => $u['name'], 'read_at' => $mine[(int)$u['id']]['read_at'] ?? null, 'ack_at' => $mine[(int)$u['id']]['ack_at'] ?? null],
        all("SELECT id, name FROM users WHERE status = 'active' ORDER BY name"));
    $units = [];
    $names = [];
    foreach (nm_tenants() as $t) if ((int)$t['hospital_id'] === (int)nm_tenant()['hospital_id']) $names[$t['tkey']] = $t['name'];
    foreach (h_all('SELECT tkey, COUNT(*) AS n, SUM(CASE WHEN ack_at IS NULL THEN 0 ELSE 1 END) AS a FROM h_reads WHERE doc_id = ? GROUP BY tkey', [$d['id']]) as $r) {
        if ($r['tkey'] === h_tkey()) continue;
        $units[] = ['unit' => $names[$r['tkey']] ?? 'Birim', 'read' => (int)$r['n'], 'acked' => (int)$r['a']];
    }
    out(['people' => $people, 'units' => $units, 'ack' => (int)$d['ack'] === 1]);
}

/** Dosya: yalnız aynı hastanenin oturum açmış kişileri */
function a_hfile_get(): void
{
    $me = current_user();
    $f = $me && hdb() && nm_mod_on('hbelge') && user_perm($me, 'hbelge') !== 'off' ? h_one('SELECT * FROM h_files WHERE id = ?', [(int)($_GET['id'] ?? 0)]) : null;
    $path = $f ? h_upload_dir() . '/' . $f['stored'] : '';
    if (!$f || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Dosya bulunamadı veya erişim yetkiniz yok.'; return; }
    session_write_close();
    $inline = empty($_GET['dl']) && in_array($f['mime'], INLINE_SAFE, true);
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $f['name']) ?: 'dosya');
    header('Content-Type: ' . $f['mime']);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($f['name']));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=31536000, immutable');
    if ($f['mime'] !== 'application/pdf') header("Content-Security-Policy: default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    readfile($path);
}
$GLOBALS['NM_GET']['hfile'] = 'a_hfile_get';

/** Açılış verisi: hastane adı ve okunmamış hastane belgesi sayısı */
$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!nm_multi() || !hdb()) return [];
    $o = ['hosp' => ['name' => (string)(nm_tenant()['hospital_name'] ?? '')]];
    if (nm_mod_on('hbelge')) {
        $o['hosp']['unread'] = (int)h_val('SELECT COUNT(*) FROM h_docs d WHERE d.created_at >= ? AND NOT EXISTS (SELECT 1 FROM h_reads r WHERE r.doc_id = d.id AND r.tkey = ? AND r.user_id = ?)',
            [(string)($me['created_at'] ?? '2000-01-01'), h_tkey(), (int)$me['id']]);
    }
    return $o;
};

/** Birim görevi: başka birimin yayımladığı yeni hastane belgesini bu birimin kişilerine bildir (her birim kendi sürecinde) */
$GLOBALS['NM_JOBS']['hdoc_notify'] = function (bool $force) {
    if (!nm_multi() || !hdb()) return null;
    $last = setting('hdoc_seen', '');
    if ($last === '') { set_setting('hdoc_seen', now()); return null; } // ilk çalışmada geçmiş belgeler bildirilmez
    $rows = h_all('SELECT * FROM h_docs WHERE created_at > ? AND tkey <> ? ORDER BY id', [$last, h_tkey()]);
    set_setting('hdoc_seen', now());
    if (!$rows) return null;
    $users = active_users_sql();
    foreach ($rows as $d) notify_users($users, 'hdoc', 'Hastane belgesi: ' . $d['title'], (H_KINDS[$d['kind']] ?? 'Belge') . ' · ' . $d['unit_name'], '#/hastane/' . (int)$d['id'], null);
    return count($rows);
};
$GLOBALS['NM_JOB_MODULE']['hdoc_notify'] = 'hbelge';

return [
    'phonebook.share' => 'a_phonebook_share',
    'hdoc.list' => 'a_hdoc_list',
    'hdoc.get' => 'a_hdoc_get',
    'hdoc.ack' => 'a_hdoc_ack',
    'hdoc.save' => 'a_hdoc_save',
    'hdoc.delete' => 'a_hdoc_delete',
    'hdoc.report' => 'a_hdoc_report',
];
