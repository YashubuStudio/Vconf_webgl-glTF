<?php
$allowed_origin = 'https://3dobjcttest.yashubustudioetc.com';

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
        return $f !== '.' && $f !== '..' && is_file($folderDir . $f);
    }));
    file_put_contents($folderDir . 'index.json', json_encode($files));
}

file_put_contents($baseDir . 'index.json', json_encode($folders));

echo json_encode(['success' => true, 'folders' => $folders]);
