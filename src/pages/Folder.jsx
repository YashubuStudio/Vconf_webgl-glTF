// src/pages/Folder.jsx
import React, { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";

export default function Folder() {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);

  // フォルダ一覧を読み込む処理を関数化
  const loadFolders = () => {
    fetch("/api/uploads/index.json")
      .then((res) => {
        if (!res.ok) throw new Error("フォルダ一覧取得失敗");
        return res.json();
      })
      .then(setFolders)
      .catch((err) => console.error("フォルダ一覧の取得に失敗:", err));
  };

  useEffect(() => {
    loadFolders();
  }, []);

  // 選択フォルダのファイル一覧を取得
  useEffect(() => {
    if (selectedFolder) {
      fetch(`/api/uploads/${selectedFolder}/index.json`)
        .then((res) => {
          if (!res.ok) throw new Error("ファイル一覧取得失敗");
          return res.json();
        })
        .then(setFiles)
        .catch((err) =>
          console.error("ファイル一覧の取得に失敗:", err)
        );
    }
  }, [selectedFolder]);

  // 状態再生成を呼び出す
  const handleRegenerate = () => {
    fetch("/api/regenerate.php")
      .then((res) => {
        if (!res.ok) throw new Error("再生成に失敗");
        return res.json();
      })
      .then(() => loadFolders())
      .catch((err) => console.error("再生成エラー:", err));
  };

  // モデルをダウンロード
  const handleDownloadModel = () => {
    const modelFile = files.find((f) => /\.(glb|gltf|zip)$/i.test(f));
    if (modelFile) {
      const link = document.createElement("a");
      link.href = `/api/uploads/${selectedFolder}/${modelFile}`;
      link.download = modelFile;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        アップロードフォルダ一覧（運営確認用）
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={handleRegenerate}
          sx={{ mr: 1, mb: 1 }}
        >
          状態再生成
        </Button>
        {folders.map((folder, idx) => (
          <Button
            key={idx}
            variant="outlined"
            onClick={() => setSelectedFolder(folder)}
            sx={{ mr: 1, mb: 1 }}
          >
            {folder}
          </Button>
        ))}
      </Box>

      {selectedFolder && (
        <>
          <Typography variant="h6" gutterBottom>
            📁 {selectedFolder} の中身
          </Typography>
          <Button
            variant="contained"
            onClick={handleDownloadModel}
            sx={{ mb: 2 }}
          >
            モデルをダウンロード
          </Button>
          <ul>
            {files.map((file, idx) => (
              <li key={idx}>
                {/\.(png|jpg|jpeg|gif)$/i.test(file) ? (
                  <img
                    src={`/api/uploads/${selectedFolder}/${file}`}
                    alt={file}
                    style={{ width: 200, margin: 10 }}
                  />
                ) : (
                  <a
                    href={`/api/uploads/${selectedFolder}/${file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Box>
  );
}
