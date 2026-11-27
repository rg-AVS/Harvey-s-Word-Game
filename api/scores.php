<?php
// One child's scores. Needs that child's PIN (or the admin password).
require __DIR__ . '/common.php';
require_post();

$name = str_field('name', 40);
$pin = body()['pin'] ?? '';
$user = find_user($name);
$pinOk = $user && $user['pin'] !== '' && is_string($pin) && hash_equals($user['pin'], trim($pin));
if (!$user || !($pinOk || is_admin($pin))) { sleep(1); reply(403, ['ok' => false, 'error' => 'That PIN doesn’t match.']); }

$rows = [];
foreach (array_slice(read_rows('scores'), 1) as $r) {
  if (($r[1] ?? '') !== $name) continue;
  $rows[] = [
    'time' => $r[0], 'subject' => $r[2], 'week' => $r[3], 'game' => $r[4],
    'score' => (int)$r[5], 'max' => (int)$r[6], 'stars' => (int)$r[7],
    'practice' => ($r[8] ?? '0') === '1', 'tricky' => ($r[9] ?? '') === '' ? [] : explode('|', $r[9]),
  ];
}
reply(200, ['ok' => true, 'name' => $user['name'], 'set' => $user['set'], 'scores' => $rows]);
