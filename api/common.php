<?php
/*
 * Shared helpers for the Word Game's server side.
 *
 * Private data (students, PINs, scores) lives in ../data/*.php files. Each one starts
 * with a line of PHP that stops it being shown, so even if someone types the address
 * into a browser they get "not found" instead of the contents.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const DATA_DIR = __DIR__ . '/../data';
const GUARD = "<?php http_response_code(404); exit; ?>\n";
const GAME_IDS = ['listen', 'builder', 'missing', 'memory', 'quiz'];
const SCORE_HEADER = ['time', 'name', 'subject', 'week', 'game', 'score', 'max', 'stars', 'practice', 'tricky'];
const USER_HEADER = ['name', 'set', 'pin'];

function reply($code, $data) { http_response_code($code); echo json_encode($data); exit; }

function config() {
  $f = __DIR__ . '/config.php';
  $c = is_file($f) ? include $f : null;
  return is_array($c) ? $c : [];
}
function admin_password() {
  $p = (string)(config()['password'] ?? '');
  return ($p === '' || $p === 'change-me') ? '' : $p;
}
function body() {
  static $b = null;
  if ($b === null) { $b = json_decode(file_get_contents('php://input'), true); if (!is_array($b)) $b = []; }
  return $b;
}
function str_field($key, $max = 200) {
  $v = body()[$key] ?? '';
  if (!is_string($v)) return '';
  $v = trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v));
  return mb_substr_safe($v, $max);
}
function mb_substr_safe($s, $max) { return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max); }
function is_admin($given = null) {
  $p = admin_password();
  if ($given === null) $given = body()['password'] ?? '';
  return $p !== '' && is_string($given) && hash_equals($p, $given);
}
function require_post() { if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['ok' => false, 'error' => 'Only POST is allowed.']); }
function require_admin() {
  if (admin_password() === '') reply(503, ['ok' => false, 'error' => 'Saving is not set up yet: copy api/config.example.php to api/config.php and choose a password.']);
  if (!is_admin()) { sleep(1); reply(403, ['ok' => false, 'error' => 'Wrong password.']); }
}

/* ---------- private CSV files in ../data ---------- */
function ensure_data_dir() {
  if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0755, true)) reply(500, ['ok' => false, 'error' => 'Could not create the data folder. Check the folder permissions with your web host.']);
  if (!is_file(DATA_DIR . '/.htaccess')) @file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\n");
  if (!is_file(DATA_DIR . '/index.html')) @file_put_contents(DATA_DIR . '/index.html', '');
}
function data_path($name) { return DATA_DIR . '/' . $name . '.php'; }
function read_rows($name) {
  $f = data_path($name);
  if (!is_file($f)) return [];
  $fh = fopen($f, 'r');
  if (!$fh) return [];
  flock($fh, LOCK_SH);
  fgets($fh); // skip the guard line
  $rows = [];
  while (($r = fgetcsv($fh, 0, ',', '"', '')) !== false) { if ($r !== [null]) $rows[] = $r; }
  flock($fh, LOCK_UN); fclose($fh);
  return $rows;
}
function write_rows($name, $rows) {
  ensure_data_dir();
  $tmp = data_path($name) . '.tmp';
  $fh = @fopen($tmp, 'w');
  if (!$fh) reply(500, ['ok' => false, 'error' => 'Could not write to the data folder. Check the folder permissions with your web host.']);
  fwrite($fh, GUARD);
  foreach ($rows as $r) fputcsv($fh, $r, ',', '"', '');
  fclose($fh);
  if (!@rename($tmp, data_path($name))) { @unlink($tmp); reply(500, ['ok' => false, 'error' => 'Could not save the file.']); }
}
function append_row($name, $header, $row) {
  ensure_data_dir();
  $f = data_path($name);
  $fh = @fopen($f, 'a');
  if (!$fh) reply(500, ['ok' => false, 'error' => 'Could not write to the data folder.']);
  flock($fh, LOCK_EX);
  clearstatcache(true, $f);
  if (filesize($f) === 0) { fwrite($fh, GUARD); fputcsv($fh, $header, ',', '"', ''); }
  fputcsv($fh, $row, ',', '"', '');
  fflush($fh); flock($fh, LOCK_UN); fclose($fh);
}

/* ---------- students ---------- */
function users() {
  $out = [];
  foreach (array_slice(read_rows('users'), 1) as $r) {
    $name = trim($r[0] ?? '');
    if ($name !== '') $out[] = ['name' => $name, 'set' => trim($r[1] ?? ''), 'pin' => trim($r[2] ?? '')];
  }
  return $out;
}
function find_user($name) {
  foreach (users() as $u) if ($u['name'] === $name) return $u;
  return null;
}
