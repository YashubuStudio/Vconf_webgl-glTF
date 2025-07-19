// src/pages/GltfZipViewerWithUpload.jsx
import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function GltfZipViewerWithUpload() {
  const [content, setContent] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const blobUrls = useRef([]);

  useEffect(() => {
    return () => {
      blobUrls.current.forEach(URL.revokeObjectURL);
      blobUrls.current = [];
    };
  }, []);

  const validateScene = async (scene) => {
    let error = null;

    // 名前のバリデーションのみ（2Byte文字や全角スペース）
    scene.traverse((obj) => {
      if (obj.isMesh) {
        if (/[^\x20-\x7E]/.test(obj.name) || /\u3000/.test(obj.name)) {
          error = "オブジェクト名に2Byte文字か全角スペースが含まれています";
        }
      }
    });

    return error;
  };

  const handleUpload = async () => {
    if (!fileToUpload) return;
    setIsUploading(true);
    setUploadStatus("");

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const res = await fetch("https://3dobjcttest.yashubustudioetc.com/api/upload.php", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (res.ok) {
        setUploadStatus(`✅ アップロード完了: ${result.fileName}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("アップロード失敗", error);
      setUploadStatus("❌ アップロード失敗: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFile = async (e) => {
    setContent(null);
    setFileToUpload(null);
    setUploadStatus("");

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".zip")) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fileMap = new Map();

      await Promise.all(
        Object.values(zip.files).map(async (entry) => {
          if (entry.dir) return;
          const blob = await entry.async("blob");
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
          fileMap.set(entry.name.replace(/\\/g, "/"), url);
        })
      );

      const gltfEntry = [...fileMap.keys()].find((k) => k.toLowerCase().endsWith(".gltf"));
      if (!gltfEntry) {
        alert("ZIP 内に .gltf が見つかりません");
        return;
      }

      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const clean = url.split("?")[0].split("#")[0];
        const filename = clean.substring(clean.lastIndexOf("/") + 1);
        const match = [...fileMap.keys()].find((k) => k.endsWith(filename));
        return match ? fileMap.get(match) : url;
      });

      new GLTFLoader(manager).load(
        fileMap.get(gltfEntry),
        async (gltf) => {
          const errMsg = await validateScene(gltf.scene);
          if (errMsg) {
            alert(errMsg);
            return;
          }
          setContent(<primitive object={gltf.scene} />);
          setFileToUpload(file);
        },
        undefined,
        (err) => console.error("GLTF load error:", err)
      );
    } else if (file.name.toLowerCase().endsWith(".glb") || file.name.toLowerCase().endsWith(".gltf")) {
      const url = URL.createObjectURL(file);
      blobUrls.current.push(url);
      new GLTFLoader().load(
        url,
        async (gltf) => {
          const errMsg = await validateScene(gltf.scene);
          if (errMsg) {
            alert(errMsg);
            URL.revokeObjectURL(url);
            return;
          }
          setContent(<primitive object={gltf.scene} />);
          setFileToUpload(file);
        },
        undefined,
        (err) => console.error("GLB load error:", err)
      );
    } else {
      alert("対応形式: .zip(.gltf/.bin/textures) または .glb/.gltf");
    }

    e.target.value = "";
  };

  return (
    <div style={{ padding: "16px" }}>
      <h2>GltfZipViewer</h2>

      <input
        type="file"
        accept=".zip,.glb,.gltf"
        onChange={handleFile}
        style={{ marginBottom: 8 }}
      />
      <Canvas style={{ height: 500, background: "#f0f0f0", marginBottom: 8 }}>
        <ambientLight />
        <directionalLight position={[5, 10, 5]} />
        <OrbitControls />
        {content}
      </Canvas>

      {content && fileToUpload && (
        <>
          <button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "アップロード中..." : "このファイルを提出する"}
          </button>

          {isUploading && (
            <div style={{
              width: "100%",
              maxWidth: "600px",
              background: "#eee",
              height: "10px",
              margin: "8px auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: "4px"
            }}>
              <div style={{
                width: "100%",
                height: "100%",
                background: "#4caf50",
                animation: "progress 2s infinite linear"
              }} />
            </div>
          )}

          {uploadStatus && (
            <div style={{ marginTop: 8, color: uploadStatus.startsWith("✅") ? "green" : "red" }}>
              {uploadStatus}
            </div>
          )}
        </>
      )}

      <style>
        {`
          @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}
      </style>
    </div>
  );
}
