<?php
$allowed_origin = 'https://3dobjcttest.yashubustudioetc.com';

// Handle CORS preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: $allowed_origin");
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

// Reject requests from disallowed origins
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== $allowed_origin) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'CORS policy: origin not allowed']);
    exit;
}

// Always send CORS headers for the allowed origin
header("Access-Control-Allow-Origin: $allowed_origin");
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

$baseDir = __DIR__ . '/uploads/';
if (!is_dir($baseDir)) {
    mkdir($baseDir, 0755, true);
}

$folders = array_values(array_filter(scandir($baseDir), function ($f) use ($baseDir) {
    return $f !== '.' && $f !== '..' && is_dir($baseDir . $f);
}));

foreach ($folders as $folder) {
    $folderDir = $baseDir . $folder . '/';
    $files = array_values(array_filter(scandir($folderDir), function ($f) use ($folderDir) {
        return $f !== '.' && $f !== '..' && is_file($folderDir . $f) && $f !== 'index.json';
    }));
    file_put_contents($folderDir . 'index.json', json_encode($files));
}

file_put_contents($baseDir . 'index.json', json_encode($folders));

echo json_encode(['success' => true, 'folders' => $folders]);
