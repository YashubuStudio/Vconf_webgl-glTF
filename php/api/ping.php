<?php
$allowed_origin = 'http://2025system.vconf.org';

if (isset($_SERVER['HTTP_ORIGIN'])) {
    if ($_SERVER['HTTP_ORIGIN'] === $allowed_origin) {
        header("Access-Control-Allow-Origin: $allowed_origin");
        header("Access-Control-Allow-Methods: GET, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type");
    } else {
        http_response_code(403);
        echo json_encode(['error' => 'CORS policy: origin not allowed']);
        exit;
    }
}

header('Content-Type: application/json');
echo json_encode([
    'status' => 'ok',
    'time' => date('Y-m-d H:i:s'),
    'server' => $_SERVER['SERVER_NAME']
]);
