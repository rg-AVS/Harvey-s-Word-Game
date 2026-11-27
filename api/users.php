<?php
// Public list of who can play: names and English sets only (never PINs).
require __DIR__ . '/common.php';
reply(200, ['ok' => true, 'ready' => admin_password() !== '', 'users' => array_map(function ($u) { return ['name' => $u['name'], 'set' => $u['set']]; }, users())]);
