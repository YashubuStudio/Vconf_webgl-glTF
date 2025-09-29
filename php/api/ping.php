<?php
header('Content-Type: application/json; charset=utf-8');

$allowed_origin = 'https://2025system.vconf.org';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: $allowed_origin");
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if (!empty($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== $allowed_origin) {
    http_response_code(403);
    echo json_encode(['error'=>'CORS policy: origin not allowed']); exit;
}

header("Access-Control-Allow-Origin: $allowed_origin");
echo json_encode([
    'status' => 'ok',
    'time'   => date('c'),
    'server' => $_SERVER['SERVER_NAME'] ?? ''
]); exit;
