<?php
/**
 * NöbetMed — Yapılandırma
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

// Google ile giriş (isteğe bağlı). Boş bırakılırsa buton görünmez.
// Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web)
// "Authorized JavaScript origins" kısmına sitenizin adresini ekleyin.
define('GOOGLE_CLIENT_ID', '');

// Saat dilimi ve dosya yükleme sınırı (MB)
define('APP_TIMEZONE', 'Europe/Istanbul');
define('MAX_UPLOAD_MB', 100);
