<?php
ob_start();

// もしJSONを返すなら（任意）：
// header('Content-Type: application/json; charset=utf-8');

$allowed_origin = 'http://2025system.vconf.org';

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

/* ================================
   .env の読み込み（非公開のパスワードを使う）
   - vlucas/phpdotenv がある場合はそれを使用
   - ない場合はサーバ環境変数から読む（Dotenvなし運用想定）
   ================================ */
$envLoaded = false;
try {
    if (file_exists(__DIR__.'/.env')) {
        if (class_exists('Dotenv\Dotenv')) {
            $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
            $dotenv->load();
            $envLoaded = true;
        } else {
            // Dotenvが未導入でも、環境により PHP が .env を自動で読み込まないため、
            // ここでは何もしない（代わりに $_ENV/$_SERVER/getenv から読む）
        }
    }
} catch (Throwable $e) {
    // 読み込み失敗時は黙って環境変数フォールバック
}

$passListCsv = $_ENV['PASSCODE_LIST'] 
    ?? $_SERVER['PASSCODE_LIST'] 
    ?? getenv('PASSCODE_LIST') 
    ?? '';

$passcodeList = array_values(array_filter(array_map('trim', explode(',', $passListCsv)), function ($v) {
    return $v !== '';
}));

// 入力値の取得
$folderRaw   = $_POST['folder_id']   ?? '';
$presenterId = $_POST['presenter_id']?? '';
$inputPass   = $_POST['passcode']    ?? ''; // ← ここからは ID と組のパスで検証する

/* ================================
   ID/パスワード検証
   - ID: 1番から開始（0ははじく）
   - パスワード: .env の PASSCODE_LIST を 1番=配列[0] として対応
   ================================ */

// IDは「1以上の整数」に限定
if (!preg_match('/^[1-9][0-9]*$/', $presenterId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid presenter_id (must be a positive integer starting from 1)']);
    ob_end_flush(); exit;
}

$index = intval($presenterId) - 1; // 1番→0

if (empty($passcodeList)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server passcode list not configured']);
    ob_end_flush(); exit;
}

if ($index < 0 || $index >= count($passcodeList)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid ID']);
    ob_end_flush(); exit;
}

$expectedPass = $passcodeList[$index];

// パスワード照合（一致しなければNG）
if (!hash_equals($expectedPass, $inputPass)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid passcode']);
    ob_end_flush(); exit;
}

/* ================================
   ここから先は元のアップロード処理
   ================================ */

// フォルダ名の形式チェック
if (!preg_match('/^\d{4}_\d{2}_\d{2}_\d{4}$/', $folderRaw)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder_id format (expected yyyy_mm_dd_tttt)']);
    ob_end_flush(); exit;
}

// presenter_id はフォルダ名に埋め込む（英数字制限→今回は数値IDだが念のため）
if (!preg_match('/^[a-zA-Z0-9]+$/', $presenterId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid presenter_id format (alphanumeric only)']);
    ob_end_flush(); exit;
}

$folderName = $folderRaw . '_' . $presenterId;
$uploadBase = __DIR__ . '/uploads/';
$uploadDir  = $uploadBase . $folderName . '/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// モデルファイルを固定名で保存
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
    if (in_array($ext, ['zip', 'glb', 'gltf'])) {
        $modelPath = $uploadDir . 'model.' . $ext;
        move_uploaded_file($_FILES['file']['tmp_name'], $modelPath);
    }
}

// 画像3枚を保存
foreach (['view1', 'view2', 'view3'] as $viewName) {
    if (isset($_FILES[$viewName]) && $_FILES[$viewName]['error'] === UPLOAD_ERR_OK) {
        $dest = $uploadDir . $viewName . '.png';
        move_uploaded_file($_FILES[$viewName]['tmp_name'], $dest);
    }
}

// 1. フォルダ内に index.json を作成
$files = array_values(array_filter(scandir($uploadDir), function ($f) use ($uploadDir) {
    return $f !== '.' && $f !== '..' && is_file($uploadDir . $f);
}));
file_put_contents($uploadDir . 'index.json', json_encode($files));

// 2. uploads/index.json にフォルダ一覧を追記（重複を避ける）
$allFoldersPath   = $uploadBase . 'index.json';
$existingFolders  = [];

if (file_exists($allFoldersPath)) {
    $json = file_get_contents($allFoldersPath);
    $existingFolders = json_decode($json, true);
    if (!is_array($existingFolders)) {
        $existingFolders = [];
    }
}

if (!in_array($folderName, $existingFolders, true)) {
    $existingFolders[] = $folderName;
    file_put_contents($allFoldersPath, json_encode($existingFolders));
}

// 成功レスポンス
echo json_encode([
    'success'      => true,
    'folder_id'    => $folderName,
    'presenter_id' => $presenterId
]);

ob_end_flush();
