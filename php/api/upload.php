<?php
ob_start();

/* ======================================================
   基本ヘッダ & ログ
   ====================================================== */
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/php-error.log');

$allowed_origin = 'https://2025system.vconf.org';

/* ---------- 小ユーティリティ ---------- */
function log_forbidden($msg, $ctx = []) {
    $safe = array_map(function($v){
        if (is_string($v) && strlen($v) > 256) $v = substr($v,0,256).'...';
        return $v;
    }, $ctx);
    error_log('[upload.php] FORBIDDEN: ' . $msg . ' ' . json_encode($safe, JSON_UNESCAPED_UNICODE));
}
function log_error($msg, $ctx = []) {
    error_log('[upload.php] ERROR: ' . $msg . ' ' . json_encode($ctx, JSON_UNESCAPED_UNICODE));
}
function sizeToBytes($s) {
    $s = trim($s);
    $u = strtoupper(substr($s, -1));
    $n = (float)$s;
    return $u === 'G' ? (int)($n * 1024 * 1024 * 1024)
         : ($u === 'M' ? (int)($n * 1024 * 1024)
         : ($u === 'K' ? (int)($n * 1024) : (int)$n));
}
/* 全角→半角の軽い正規化（日本語IME対策） */
function normalize_input($s) {
    $s = trim((string)$s);
    if (function_exists('mb_convert_kana')) {
        // 数字とスペースを半角に
        $s = mb_convert_kana($s, 'ns', 'UTF-8');
    }
    return trim($s);
}
/* 先頭のUTF-8 BOMを落とす */
function strip_bom($s) {
    return preg_replace('/^\xEF\xBB\xBF/', '', (string)$s);
}

/* ======================================================
   CORS / プリフライト
   ====================================================== */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (!empty($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] === $allowed_origin) {
        header("Access-Control-Allow-Origin: $allowed_origin");
        header("Access-Control-Allow-Methods: POST, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type");
    }
    http_response_code(204);
    ob_end_flush(); exit;
}
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

/* ======================================================
   メソッド制限
   ====================================================== */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    ob_end_flush(); exit;
}

/* ======================================================
   POST サイズ超過検知（413）
   ====================================================== */
$cl = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
$maxPostBytes = sizeToBytes(ini_get('post_max_size') ?: '8M');
if ($cl > 0 && $cl > $maxPostBytes && empty($_POST) && empty($_FILES)) {
    http_response_code(413);
    echo json_encode(['error' => 'Request entity too large']);
    ob_end_flush(); exit;
}

/* ======================================================
   .env ロード（BOM/空白/改行の厳密ケア）
   ====================================================== */
function strip_bom($s) {
    return preg_replace('/^\xEF\xBB\xBF/', '', (string)$s);
}
function loadEnvFile($path) {
    if (!is_readable($path)) { return; }
    $raw = file_get_contents($path);
    if ($raw === false) return;
    $raw = strip_bom($raw);
    $lines = preg_split('/\R/u', $raw);
    foreach ($lines as $line) {
        if ($line === null) continue;
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (!preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i', $line, $m)) continue;
        $key = $m[1];
        $val = $m[2];
        if ((strlen($val) >= 2) && (
            (substr($val,0,1) === '"' && substr($val,-1) === '"') ||
            (substr($val,0,1) === "'" && substr($val,-1) === "'")
        )) {
            $val = substr($val, 1, -1);
        }
        $val = strip_bom($val);
        $val = str_replace(['\n','\r','\t'], ["\n","\r","\t"], $val);
        $val = trim($val);
        putenv("$key=$val");
        $_ENV[$key]    = $val;
        $_SERVER[$key] = $val;
    }
}

/* 環境 → /api/.env の順に取得（ここで trim/strip_bom を先に実施） */
$passListCsv = $_ENV['PASSCODE_LIST']
    ?? $_SERVER['PASSCODE_LIST']
    ?? getenv('PASSCODE_LIST')
    ?? '';

if ($passListCsv === '') {
    loadEnvFile(__DIR__ . '/.env');
    $passListCsv = $_ENV['PASSCODE_LIST']
        ?? $_SERVER['PASSCODE_LIST']
        ?? getenv('PASSCODE_LIST')
        ?? '';
}

/* ←★ ここが重要：空白・改行・BOMだけのケースを空とみなす */
$passListCsv = trim(strip_bom($passListCsv));
if ($passListCsv === '') {
    http_response_code(500);
    echo json_encode(['error' => 'Server passcode list not configured']);
    ob_end_flush(); exit;
}

/* CSV を配列化（空要素を除外）。必要ならスペース後のカンマもOK */
$rawItems = array_map('trim', explode(',', $passListCsv));
$passcodeList = [];
foreach ($rawItems as $item) {
    if ($item === '') continue;
    // （必要なら）全角→半角の軽い正規化
    if (function_exists('mb_convert_kana')) {
        $item = mb_convert_kana($item, 's', 'UTF-8'); // 空白半角化
    }
    $passcodeList[] = $item;
}

/* 配列が空なら “設定不備” として 500 にする（←ここが今回の肝） */
if (count($passcodeList) === 0) {
    http_response_code(500);
    echo json_encode(['error' => 'Server passcode list is empty after parsing']);
    ob_end_flush(); exit;
}


/* ======================================================
   入力取得（半角化・trim）
   ====================================================== */
$folderRaw   = isset($_POST['folder_id'])    ? normalize_input($_POST['folder_id'])    : '';
$presenterId = isset($_POST['presenter_id']) ? normalize_input($_POST['presenter_id']) : '';
$inputPass   = isset($_POST['passcode'])     ? normalize_input($_POST['passcode'])     : '';

/* ======================================================
   ID/パス検証
   ====================================================== */
if (!preg_match('/^[1-9][0-9]*$/', $presenterId)) {
    log_forbidden('invalid presenter_id format', ['presenter_id'=>$presenterId]);
    http_response_code(400);
    echo json_encode(['error' => 'Invalid presenter_id (must be an integer >= 1)']);
    ob_end_flush(); exit;
}

$index = (int)$presenterId - 1; // 1番→0
if ($index < 0 || $index >= count($passcodeList)) {
    log_forbidden('presenter_id out of range', ['presenter_id'=>$presenterId, 'list_count'=>count($passcodeList)]);
    http_response_code(403);
    echo json_encode(['error' => 'Invalid ID']);
    ob_end_flush(); exit;
}

/* 期待パス取得（.env側も念のためトリム/BOM除去/半角化済） */
$expectedPass = $passcodeList[$index];

/* 厳密比較（大文字小文字は区別。必要なら strtolower 同士で揃える） */
if (!is_string($inputPass) || !is_string($expectedPass) || !hash_equals($expectedPass, $inputPass)) {
    log_forbidden('passcode mismatch', [
        'presenter_id'=>$presenterId,
        'expected_len'=>strlen($expectedPass),
        'got_len'=>strlen($inputPass)
    ]);
    http_response_code(403);
    echo json_encode(['error' => 'Invalid passcode']);
    ob_end_flush(); exit;
}

/* ======================================================
   ここからアップロード処理
   ====================================================== */

/* フォルダID形式チェック: yyyy_mm_dd_tttt */
if (!preg_match('/^\d{4}_\d{2}_\d{2}_\d{4}$/', $folderRaw)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder_id format (expected yyyy_mm_dd_tttt)']);
    ob_end_flush(); exit;
}

/* presenter_id はフォルダ名に埋め込む（英数字のみチェックは念のため） */
if (!preg_match('/^[a-zA-Z0-9]+$/', $presenterId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid presenter_id format (alphanumeric only)']);
    ob_end_flush(); exit;
}

/* 保存先準備 */
$folderName = $folderRaw . '_' . $presenterId;
$uploadBase = __DIR__ . '/uploads/';
$uploadDir  = $uploadBase . $folderName . '/';

if (!is_dir($uploadBase) && !mkdir($uploadBase, 0755, true)) {
    log_error('failed to create upload base', ['path'=>$uploadBase]);
    http_response_code(500);
    echo json_encode(['error' => 'Failed to prepare upload base']);
    ob_end_flush(); exit;
}
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
    log_error('failed to create upload dir', ['path'=>$uploadDir]);
    http_response_code(500);
    echo json_encode(['error' => 'Failed to create upload directory']);
    ob_end_flush(); exit;
}
if (!is_writable($uploadDir)) {
    log_error('upload dir not writable', ['path'=>$uploadDir]);
    http_response_code(500);
    echo json_encode(['error' => 'Upload directory not writable']);
    ob_end_flush(); exit;
}

/* モデルファイル（zip/glb/gltf） */
if (isset($_FILES['file'])) {
    if ($_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        if (in_array($ext, ['zip', 'glb', 'gltf'], true)) {
            $modelPath = $uploadDir . 'model.' . $ext;
            if (!is_uploaded_file($_FILES['file']['tmp_name']) ||
                !move_uploaded_file($_FILES['file']['tmp_name'], $modelPath)) {
                log_error('failed to move model', ['tmp'=>$_FILES['file']['tmp_name'], 'dest'=>$modelPath]);
                http_response_code(500);
                echo json_encode(['error' => 'Failed to store model file']);
                ob_end_flush(); exit;
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid model file extension']);
            ob_end_flush(); exit;
        }
    } elseif ($_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
        http_response_code(400);
        echo json_encode(['error' => 'Model file upload error', 'code' => $_FILES['file']['error']]);
        ob_end_flush(); exit;
    }
}

/* 画像3枚（view1~3） */
foreach (['view1', 'view2', 'view3'] as $viewName) {
    if (isset($_FILES[$viewName])) {
        if ($_FILES[$viewName]['error'] === UPLOAD_ERR_OK) {
            $dest = $uploadDir . $viewName . '.png';
            if (!is_uploaded_file($_FILES[$viewName]['tmp_name']) ||
                !move_uploaded_file($_FILES[$viewName]['tmp_name'], $dest)) {
                log_error('failed to move view image', ['name'=>$viewName]);
                http_response_code(500);
                echo json_encode(['error' => "Failed to store $viewName"]);
                ob_end_flush(); exit;
            }
        } elseif ($_FILES[$viewName]['error'] !== UPLOAD_ERR_NO_FILE) {
            http_response_code(400);
            echo json_encode(['error' => "$viewName upload error", 'code' => $_FILES[$viewName]['error']]);
            ob_end_flush(); exit;
        }
    }
}

/* index.json（フォルダ内） */
$files = array_values(array_filter(scandir($uploadDir), function ($f) use ($uploadDir) {
    return $f !== '.' && $f !== '..' && is_file($uploadDir . $f);
}));
file_put_contents($uploadDir . 'index.json', json_encode($files));

/* uploads/index.json（全体一覧：重複回避で追記） */
$allFoldersPath  = $uploadBase . 'index.json';
$existingFolders = [];
if (file_exists($allFoldersPath)) {
    $json = file_get_contents($allFoldersPath);
    $existingFolders = json_decode($json, true);
    if (!is_array($existingFolders)) $existingFolders = [];
}
if (!in_array($folderName, $existingFolders, true)) {
    $existingFolders[] = $folderName;
    file_put_contents($allFoldersPath, json_encode($existingFolders));
}

/* 成功レスポンス */
echo json_encode([
    'success'      => true,
    'folder_id'    => $folderName,
    'presenter_id' => $presenterId
]);

ob_end_flush();
