// src/pages/Folder.jsx
import React, { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";

export default function Folder() {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);

  // フォルダ一覧を読み込む
  useEffect(() => {
    fetch("/api/uploads/index.json")
      .then((res) => {
        if (!res.ok) throw new Error("フォルダ一覧取得失敗");
        return res.json();
      })
      .then(setFolders)
      .catch((err) => console.error("フォルダ一覧の取得に失敗:", err));
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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        アップロードフォルダ一覧（運営確認用）
      </Typography>
      <Box sx={{ mb: 2 }}>
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
