<?php
/**
 * dupcii — Yapılandırma
 *
 * Varsayılan ayarlarla hiçbir şeyi değiştirmeden çalışır (SQLite).
 * MySQL kullanmak isterseniz DB_DRIVER değerini 'mysql' yapıp bilgileri doldurun;
 * tablolar ilk açılışta otomatik oluşturulur, SQL içe aktarmanız gerekmez.
 */

// 'sqlite' (önerilen, sıfır ayar) veya 'mysql'
define('DB_DRIVER', 'sqlite');

// Yalnızca DB_DRIVER = 'mysql' ise kullanılır (Hostinger hPanel > Veritabanları)
define('DB_HOST', 'localhost');
define('DB_NAME', 'u000000000_nobetmed');
define('DB_USER', 'u000000000_nobetmed');
define('DB_PASS', '');

// Sitenin tam adresi (isteğe bağlı), ör. 'https://portal.hastaneniz.com'. E-postalardaki bağlantılar için kullanılır.
// Boş bırakılırsa yöneticinin siteyi açtığı adres otomatik kaydedilir.
define('APP_URL', '');

// Google ile giriş (isteğe bağlı). Boş bırakılırsa buton görünmez.
// Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web)
// "Authorized JavaScript origins" kısmına sitenizin adresini ekleyin.
define('GOOGLE_CLIENT_ID', '');

// İlk yönetici hesabı (isteğe bağlı). Doldurulursa ilk açılışta bu hesap otomatik oluşturulur
// ve ilk girişte şifre değiştirilmesi istenir. Boş bırakılırsa kurulum ekranı açılır.
// Şifre açık yazılmaz; password_hash() ile üretilmiş özet (hash) yazılır.
define('INITIAL_ADMIN_NAME', '');
define('INITIAL_ADMIN_EMAIL', '');
define('INITIAL_ADMIN_PASSWORD_HASH', '');
define('INITIAL_ORG_NAME', '');

define('APP_TIMEZONE', 'Europe/Istanbul');

// Dosya başına yükleme sınırı (MB). 0 = sınırsız (dosyalar parça parça yüklenir,
// sunucunun PHP yükleme sınırına takılmaz; tek sınır hosting disk alanınızdır).
define('MAX_UPLOAD_MB', 0);
