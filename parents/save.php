<?php
/*
 * Saves the word list from the Parents' Corner page into ../words.csv.
 * Needs a password set in config.php (copy config.example.php to config.php).
 * Keeps the last 30 versions in parents/backups/ in case of mistakes.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply($code, $data) { http_response_code($code); echo json_encode($data); exit; }

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? include $configFile : null;
$password = is_array($config) && isset($config['password']) ? (string)$config['password'] : '';
$ready = $password !== '' && $password !== 'change-me';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') reply(200, ['ok' => true, 'ready' => $ready]);
if ($method !== 'POST') reply(405, ['ok' => false, 'error' => 'Only POST is allowed.']);
if (!$ready) reply(503, ['ok' => false, 'error' => 'Saving is not set up yet: copy config.example.php to config.php and choose a password.']);

$body = json_decode(file_get_contents('php://input'), true);
$given = is_array($body) && isset($body['password']) && is_string($body['password']) ? $body['password'] : '';
if (!hash_equals($password, $given)) { sleep(2); reply(403, ['ok' => false, 'error' => 'Wrong password.']); }

$csv = isset($body['csv']) && is_string($body['csv']) ? $body['csv'] : '';
if ($csv === '' || strlen($csv) > 512000) reply(400, ['ok' => false, 'error' => 'The word list is empty or too big.']);
if (!preg_match('//u', $csv)) reply(400, ['ok' => false, 'error' => 'The word list has characters that are not valid UTF-8.']);
$csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv);
$firstLine = strtolower(strtok($csv, "\n"));
if (strpos($firstLine, 'date') === false || strpos($firstLine, 'word') === false) reply(400, ['ok' => false, 'error' => 'The word list is missing its header row.']);

$target = dirname(__DIR__) . '/words.csv';

// keep a backup of the current file
$backups = __DIR__ . '/backups';
if (!is_dir($backups)) @mkdir($backups, 0755);
if (is_dir($backups) && is_file($target)) {
  @copy($target, $backups . '/words-' . date('Y-m-d-His') . '.csv');
  $old = glob($backups . '/words-*.csv') ?: [];
  sort($old);
  foreach (array_slice($old, 0, max(0, count($old) - 30)) as $f) @unlink($f);
}

$tmp = $target . '.tmp';
if (@file_put_contents($tmp, $csv, LOCK_EX) === false || !@rename($tmp, $target)) {
  @unlink($tmp);
  reply(500, ['ok' => false, 'error' => 'The website would not let me write words.csv. Check the folder permissions with your web host.']);
}
reply(200, ['ok' => true, 'saved' => date('c')]);
