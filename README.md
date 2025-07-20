# Vconf glTF Viewer

React を利用したシンプルな glTF/glb ビューワーです。`React Three Fiber` と `@react-three/drei` を用いており、ブラウザ上で手軽に 3D モデルを確認できます。ZIP 形式でまとめた glTF パッケージの読み込みや、表示したモデルを PHP 製 API へアップロードする機能も備えています。

## 機能
- `.glb` または glTF 一式を格納した `.zip` ファイルのアップロード
- `/fbx` パスからは `.fbx` を ZIP 化したものも表示可能
- 読み込んだモデルをそのままブラウザで確認
- `php/api/upload.php` へデータを送信するアップロードボタン
- `php/api/ping.php` によるサーバー接続チェック

## 使い方
1. リポジトリ取得後に依存パッケージをインストールします。
   ```bash
   npm install
   ```
   もし個別に依存関係を追加する必要がある場合は、次のコマンドで一覧をまとめてインストールできます。
   ```bash
   npm run setup
   ```
2. 開発用サーバーを起動します。
   ```bash
   npm start
   ```
   初期状態では [http://localhost:3000](http://localhost:3000) でアプリが動作します。

### ビルド
本番用のビルドは次のコマンドで作成できます。
```bash
npm run build
```
生成物は `build/` ディレクトリへ出力されます。

### テスト
```bash
npm test
```
`react-scripts` のテストランナーが起動します。

## サーバーサイド
`php/api` フォルダーには簡易アップロード API が含まれています。PHP を実行できる環境があればそのまま利用可能です。
- `upload.php` : 受け取った ZIP/GLB を `uploads/` 以下に保存
- `ping.php` : 接続確認用エンドポイント

## ライセンス
MIT License
