// src/pages/GltfZipViewerWithIDB_backup.jsx
import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function GltfZipViewer() {
  const [content, setContent] = useState(null);
  const blobUrls = useRef([]);       // ← 型パラメータを外す

  useEffect(() => {
    return () => {
      blobUrls.current.forEach(URL.revokeObjectURL);
      blobUrls.current = [];
    };
  }, []);

  const handleFile = async (e) => {
    setContent(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".zip")) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fileMap = new Map();     // ← 型パラメータを外す

      await Promise.all(
        Object.values(zip.files).map(async (entry) => {
          if (entry.dir) return;
          const blob = await entry.async("blob");
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
          fileMap.set(entry.name.replace(/\\/g, "/"), url);
        })
      );

      const gltfEntry = [...fileMap.keys()].find((k) =>
        k.toLowerCase().endsWith(".gltf")
      );
      if (!gltfEntry) {
        alert("ZIP 内に .gltf が見つかりません");
        return;
      }

      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const clean = url.split("?")[0].split("#")[0];
        const filename = clean.substring(clean.lastIndexOf("/") + 1);
        const match = [...fileMap.keys()].find((k) =>
          k.endsWith(filename)
        );
        return match ? fileMap.get(match) : url;
      });

      new GLTFLoader(manager).load(
        fileMap.get(gltfEntry),
        (gltf) => setContent(<primitive object={gltf.scene} />),
        undefined,
        (err) => console.error("GLTF load error:", err)
      );
    }
    else if (
      file.name.toLowerCase().endsWith(".glb") ||
      file.name.toLowerCase().endsWith(".gltf")
    ) {
      const url = URL.createObjectURL(file);
      blobUrls.current.push(url);
      new GLTFLoader().load(
        url,
        (gltf) => {
          setContent(<primitive object={gltf.scene} />);
          URL.revokeObjectURL(url);
        },
        undefined,
        (err) => console.error("GLTF load error:", err)
      );
    } else {
      alert("対応形式: .zip(.gltf/.bin/textures) または .glb/.gltf");
    }

    e.target.value = "";
  };

  return (
    <div>
      <input
        type="file"
        accept=".zip,.glb"
        onChange={handleFile}
        style={{ marginBottom: 8 }}
      />
      <Canvas style={{ height: 500, background: "#f0f0f0" }}>
        <ambientLight />
        <directionalLight position={[5, 10, 5]} />
        <OrbitControls />
        {content}
      </Canvas>
    </div>
  );
}
