<?php
// Grown-up actions from the /parentswords page. Every action needs the admin password.
require __DIR__ . '/common.php';
require_post();
require_admin();

$action = str_field('action', 20);

if ($action === 'check') reply(200, ['ok' => true]);

if ($action === 'users') reply(200, ['ok' => true, 'users' => users()]);

if ($action === 'save_users') {
  $list = body()['users'] ?? null;
  if (!is_array($list) || count($list) > 200) reply(400, ['ok' => false, 'error' => 'Bad list of students.']);
  $rows = [USER_HEADER]; $seen = [];
  foreach ($list as $u) {
    if (!is_array($u)) continue;
    $clean = function ($v, $max) { return is_string($v) ? mb_substr_safe(trim(preg_replace('/[\x00-\x1F\x7F,|]/u', ' ', $v)), $max) : ''; };
    $name = $clean($u['name'] ?? '', 40);
    if ($name === '') continue;
    if (isset($seen[strtolower($name)])) reply(400, ['ok' => false, 'error' => "Two students are called “{$name}”. Please make the names different."]);
    $seen[strtolower($name)] = true;
    $rows[] = [$name, $clean($u['set'] ?? '', 20), $clean($u['pin'] ?? '', 12)];
  }
  write_rows('users', $rows);
  reply(200, ['ok' => true]);
}

if ($action === 'save_words') {
  $csv = body()['csv'] ?? '';
  if (!is_string($csv) || $csv === '' || strlen($csv) > 1024 * 1024) reply(400, ['ok' => false, 'error' => 'The word list is empty or too big.']);
  if (!preg_match('//u', $csv)) reply(400, ['ok' => false, 'error' => 'The word list has characters that are not valid UTF-8.']);
  $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv);
  $first = strtolower(strtok($csv, "\n"));
  if (strpos($first, 'date') === false || strpos($first, 'word') === false) reply(400, ['ok' => false, 'error' => 'The word list is missing its header row.']);
  $target = dirname(__DIR__) . '/words.csv';

  ensure_data_dir();
  $backups = DATA_DIR . '/backups';
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
  reply(200, ['ok' => true]);
}

reply(400, ['ok' => false, 'error' => 'Unknown action.']);
