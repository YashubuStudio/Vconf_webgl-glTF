import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function GltfZipViewerWithUpload() {
  const [scene, setScene] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const blobUrls = useRef([]);
  const canvasRef = useRef(null);
  const controls = useRef([]);
  const cameras = useRef([]);
  const animationRef = useRef(null);
  const modelInfo = useRef({ center: new THREE.Vector3(0, 0, 0), size: 1 });

  // Clean up
  useEffect(() => {
    return () => {
      blobUrls.current.forEach(URL.revokeObjectURL);
      blobUrls.current = [];
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      controls.current.forEach(ctrl => ctrl && ctrl.dispose());
    };
  }, []);

  useEffect(() => {
    if (!scene || !canvasRef.current) return;

    // モデル中心＆サイズ
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3()).length();
    modelInfo.current = { center, size };

    // Renderer
    const canvasEl = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setClearColor(0xe0e0e0);
    renderer.setScissorTest(true);

    // ライト
    if (!scene.getObjectByName("__autolight")) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      const direct = new THREE.DirectionalLight(0xffffff, 1.2);
      direct.position.set(center.x + size, center.y + size, center.z + size);
      ambient.name = direct.name = "__autolight";
      scene.add(ambient, direct);
    }

    // カメラ・コントロール生成
    const cameraPos = [
      [0, size * 0.5, size * 1.5],
      [size, size * 0.3, -size],
      [0, size * 2, size * 2],
    ];
    cameras.current = cameraPos.map((pos) => {
      const cam = new THREE.PerspectiveCamera(45, 1, size * 0.01, size * 10);
      cam.position.set(...pos);
      cam.lookAt(center);
      return cam;
    });
    controls.current = cameras.current.map((cam) => {
      const ctrl = new OrbitControls(cam, canvasEl);
      ctrl.target.copy(center);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      ctrl.screenSpacePanning = false;
      return ctrl;
    });

    let draggingView = null;
    const getActiveView = (x, y, width, height) => {
      const w1 = width * 0.75, h2 = height * 0.5;
      if (x < w1) return 0;
      if (y >= h2) return 1; // 右上
      return 2;              // 右下
    };

    let activeView = 0; // 最初はメインビューを有効化
    const onPointerDown = e => {
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const width = rect.width, height = rect.height;
    activeView = getActiveView(x, height - y, width, height);

    // ポインターダウン時にコントロールを更新
    controls.current.forEach((ctrl, i) => ctrl.enabled = (i === activeView));
  };

  const onPointerUp = () => {
    // ドラッグ終了後も最後に触ったビューのカメラ操作は維持する
  };

  const onPointerMove = () => {
    // ポインター移動時も対象ビューのみ有効
    controls.current.forEach((ctrl, i) => ctrl.enabled = (i === activeView));
  };
  
    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerUp);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("touchstart", onPointerDown);
    canvasEl.addEventListener("touchend", onPointerUp);
    canvasEl.addEventListener("touchmove", onPointerMove);

    // 描画
    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(canvasEl.clientWidth * dpr);
      const height = Math.round(canvasEl.clientHeight * dpr);
      if (canvasEl.width !== width || canvasEl.height !== height) {
        renderer.setSize(width, height, false);
      }
      const w1 = Math.floor(width * 0.75), h1 = height;
      const w2 = Math.floor(width * 0.25), h2 = Math.floor(height * 0.5);

      controls.current.forEach(ctrl => ctrl.update());

      // メインビュー
      renderer.setViewport(0, 0, w1, h1);
      renderer.setScissor(0, 0, w1, h1);
      cameras.current[0].aspect = w1 / h1;
      cameras.current[0].updateProjectionMatrix();
      renderer.render(scene, cameras.current[0]);

      // view2（右上）
      renderer.setViewport(w1, h2, w2, h2);
      renderer.setScissor(w1, h2, w2, h2);
      cameras.current[1].aspect = w2 / h2;
      cameras.current[1].updateProjectionMatrix();
      renderer.render(scene, cameras.current[1]);

      // view3（右下）
      renderer.setViewport(w1, 0, w2, h2);
      renderer.setScissor(w1, 0, w2, h2);
      cameras.current[2].aspect = w2 / h2;
      cameras.current[2].updateProjectionMatrix();
      renderer.render(scene, cameras.current[2]);

      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    // クリーンアップ
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      controls.current.forEach(ctrl => ctrl && ctrl.dispose());
      ["pointerdown", "pointerup", "pointerleave", "pointermove", "touchstart", "touchend", "touchmove"].forEach(ev => {
        canvasEl.removeEventListener(ev, onPointerDown);
        canvasEl.removeEventListener(ev, onPointerUp);
        canvasEl.removeEventListener(ev, onPointerMove);
      });
    };
  }, [scene]);

  // バリデーション
  const validateScene = async (scene) => {
    let error = null;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        if (/[^\x20-\x7E]/.test(obj.name) || /\u3000/.test(obj.name)) {
          error = "オブジェクト名に2Byte文字か全角スペースが含まれています";
        }
      }
    });
    return error;
  };

  // アップロード
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
      setUploadStatus("❌ アップロード失敗: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // ファイル入力
  const handleFile = async (e) => {
    setScene(null);
    setFileToUpload(null);
    setUploadStatus("");
    modelInfo.current = { center: new THREE.Vector3(0, 0, 0), size: 1 };

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
          setScene(gltf.scene);
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
          setScene(gltf.scene);
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
    <div style={{ padding: 16 }}>
      <h2>Gltf Multi-View Viewer</h2>
      <input type="file" accept=".zip,.glb,.gltf" onChange={handleFile} style={{ marginBottom: 8 }} />
      <div style={{ position: "relative", width: "100%", height: "600px", border: "1px solid #bbb" }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            background: "#e0e0e0",
            touchAction: "none",
            cursor: "grab"
          }}
        />
        {/* 枠線は上に重ねる */}
        <div style={{
          pointerEvents: "none",
          position: "absolute",
          top: 0, left: 0, bottom: 0, right: 0,
          width: "100%",
          height: "100%",
          zIndex: 10
        }}>
          {/* Main View */}
          <div style={{
            position: "absolute",
            left: 0, top: 0, width: "75%", height: "100%",
            border: "3px solid #888", boxSizing: "border-box", borderRadius: 6
          }} />
          {/* Right Top View */}
          <div style={{
            position: "absolute",
            left: "75%", top: 0, width: "25%", height: "50%",
            border: "3px solid #4c8", boxSizing: "border-box", borderRadius: 6
          }} />
          {/* Right Bottom View */}
          <div style={{
            position: "absolute",
            left: "75%", top: "50%", width: "25%", height: "50%",
            border: "3px solid #c48", boxSizing: "border-box", borderRadius: 6
          }} />
        </div>
      </div>
      {scene && fileToUpload && (
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
