<?php
// The game sends one of these at the end of every go.
require __DIR__ . '/common.php';
require_post();

$name = str_field('name', 40);
if (!find_user($name)) reply(404, ['ok' => false, 'error' => 'Unknown player.']);

$subject = str_field('subject', 10);
$game = str_field('game', 10);
$week = str_field('week', 10);
if (!in_array($subject, ['english', 'spanish'], true) || !in_array($game, GAME_IDS, true) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $week)) reply(400, ['ok' => false, 'error' => 'Bad score.']);

$int = function ($k, $max) { $v = body()[$k] ?? 0; return is_numeric($v) ? max(0, min($max, (int)$v)) : 0; };
$score = $int('score', 1000);
$max = $int('max', 1000);
$stars = $int('stars', 3);
$practice = !empty(body()['practice']) ? '1' : '0';

$tricky = body()['tricky'] ?? [];
$tricky = is_array($tricky) ? array_slice(array_filter($tricky, 'is_string'), 0, 30) : [];
$tricky = implode('|', array_map(function ($t) { return mb_substr_safe(trim(str_replace(['|', "\n", "\r"], ' ', $t)), 60); }, $tricky));

clearstatcache();
if (is_file(data_path('scores')) && filesize(data_path('scores')) > 20 * 1024 * 1024) reply(507, ['ok' => false, 'error' => 'The scores file is full.']);

append_row('scores', SCORE_HEADER, [date('Y-m-d H:i'), $name, $subject, $week, $game, $score, $max, $stars, $practice, $tricky]);
reply(200, ['ok' => true]);
