<?php
ob_start();

$allowed_origin = 'https://3dobjcttest.yashubustudioetc.com';

if (isset($_SERVER['HTTP_ORIGIN'])) {
    if ($_SERVER['HTTP_ORIGIN'] === $allowed_origin) {
        header("Access-Control-Allow-Origin: $allowed_origin");
        header("Access-Control-Allow-Methods: POST");
        header("Access-Control-Allow-Headers: Content-Type");
    } else {
        http_response_code(403);
        echo json_encode(['error' => 'CORS policy: origin not allowed']);
        ob_end_flush(); exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    ob_end_flush(); exit;
}

// 入力値の取得
$folderRaw     = $_POST['folder_id'] ?? '';
$presenterId   = $_POST['presenter_id'] ?? '';
$passcode      = $_POST['passcode'] ?? '';
$passcode_expected = 'vconf2025test';

// パスコード検証
if ($passcode !== $passcode_expected) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid passcode']);
    ob_end_flush(); exit;
}

// フォルダ名の形式チェック
if (!preg_match('/^\d{4}_\d{2}_\d{2}_\d{4}$/', $folderRaw)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder_id format (expected yyyy_mm_dd_tttt)']);
    ob_end_flush(); exit;
}

// 発表者番号の形式チェック（英数字のみ）
if (!preg_match('/^[a-zA-Z0-9]+$/', $presenterId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid presenter_id format (alphanumeric only)']);
    ob_end_flush(); exit;
}

// ✅ presenter_id をフォルダ名に組み込む
$folderName = $folderRaw . '_' . $presenterId;
$uploadBase = __DIR__ . '/uploads/';
$uploadDir = $uploadBase . $folderName . '/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// ✅ モデルファイルを常に model.zip や model.glb 等の固定名で保存
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
    if (in_array($ext, ['zip', 'glb', 'gltf'])) {
        $modelPath = $uploadDir . 'model.' . $ext;
        move_uploaded_file($_FILES['file']['tmp_name'], $modelPath);
    }
}

// ✅ 画像3枚を保存
$log = [];

foreach (['view1', 'view2', 'view3'] as $viewName) {
    if (isset($_FILES[$viewName]) && $_FILES[$viewName]['error'] === UPLOAD_ERR_OK) {
        $dest = $uploadDir . $viewName . '.png';
        move_uploaded_file($_FILES[$viewName]['tmp_name'], $dest);
    }
}

// ✅ 成功レスポンス
echo json_encode([
    'success'      => true,
    'folder_id'    => $folderName,
    'presenter_id' => $presenterId
]);

ob_end_flush();
