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

  const [presenterId, setPresenterId] = useState("");
  const [passcode, setPasscode] = useState("");

  const blobUrls = useRef([]);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const controls = useRef([]);
  const cameras = useRef([]);
  const animationRef = useRef(null);
  const modelInfo = useRef({ center: new THREE.Vector3(), size: 1 });

  // ---------- Cleanup on unmount ----------
  useEffect(() => {
    return () => {
      blobUrls.current.forEach(URL.revokeObjectURL);
      blobUrls.current = [];
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      controls.current.forEach(c => c && c.dispose());
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss?.();
      }
    };
  }, []);

  // ---------- Scene dependent initialization ----------
  useEffect(() => {
    if (!scene || !canvasRef.current) return;

    const canvasEl = canvasRef.current;

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    modelInfo.current = { center, size };

    // Renderer (preserveDrawingBuffer = true for capture)
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setClearColor(0xe0e0e0);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setScissorTest(true);
    rendererRef.current = renderer;

    // Lights (idempotent)
    if (!scene.getObjectByName("__autolight_ambient")) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      ambient.name = "__autolight_ambient";
      const direct = new THREE.DirectionalLight(0xffffff, 1.2);
      direct.position.set(center.x + size, center.y + size, center.z + size);
      direct.name = "__autolight_dir";
      scene.add(ambient, direct);
    }

    // Cameras
    const cameraPositions = [
      [0, size * 0.5, size * 1.5],
      [size, size * 0.3, -size],
      [0, size * 2, size * 2]
    ];
    cameras.current = cameraPositions.map(pos => {
      const cam = new THREE.PerspectiveCamera(45, 1, size * 0.01, size * 10);
      cam.position.set(...pos);
      cam.lookAt(center);
      return cam;
    });

    // Controls
    controls.current = cameras.current.map(cam => {
      const ctrl = new OrbitControls(cam, canvasEl);
      ctrl.target.copy(center);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      ctrl.screenSpacePanning = false;
      return ctrl;
    });

    // ---------------- View Switching ----------------
    const getActiveView = (x, y, width, height) => {
      const w1 = width * 0.75;
      const h2 = height * 0.5;
      if (x < w1) return 0;
      // note: y is flipped later (we pass y = height - pointerY)
      if (y >= h2) return 1;
      return 2;
    };

    let activeView = 0;

    const onPointerDown = e => {
      const rect = canvasEl.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      activeView = getActiveView(x, height - y, width, height);
      controls.current.forEach((ctrl, i) => (ctrl.enabled = i === activeView));
    };
    const onPointerMove = () => {
      controls.current.forEach((ctrl, i) => (ctrl.enabled = i === activeView));
    };
    const onPointerUp = () => {
      // keep last active view enabled
    };

    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerUp);
    canvasEl.addEventListener("touchstart", onPointerDown, { passive: true });
    canvasEl.addEventListener("touchmove", onPointerMove, { passive: true });
    canvasEl.addEventListener("touchend", onPointerUp);

    // ---------------- Animation Loop ----------------
    const animate = () => {
      const widthCss = canvasEl.clientWidth;
      const heightCss = canvasEl.clientHeight;
      const dpr = renderer.getPixelRatio();
      const width = Math.round(widthCss * dpr);
      const height = Math.round(heightCss * dpr);
      if (canvasEl.width !== width || canvasEl.height !== height) {
        renderer.setSize(widthCss, heightCss, false);
      }

      const w1 = Math.floor(width * 0.75);
      const h1 = height;
      const w2 = Math.floor(width * 0.25);
      const h2 = Math.floor(height * 0.5);

      controls.current.forEach(c => c.update());

      // Main
      renderer.setViewport(0, 0, w1, h1);
      renderer.setScissor(0, 0, w1, h1);
      cameras.current[0].aspect = w1 / h1;
      cameras.current[0].updateProjectionMatrix();
      renderer.render(scene, cameras.current[0]);

      // Right Top
      renderer.setViewport(w1, h2, w2, h2);
      renderer.setScissor(w1, h2, w2, h2);
      cameras.current[1].aspect = w2 / h2;
      cameras.current[1].updateProjectionMatrix();
      renderer.render(scene, cameras.current[1]);

      // Right Bottom
      renderer.setViewport(w1, 0, w2, h2);
      renderer.setScissor(w1, 0, w2, h2);
      cameras.current[2].aspect = w2 / h2;
      cameras.current[2].updateProjectionMatrix();
      renderer.render(scene, cameras.current[2]);

      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup this effect
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      controls.current.forEach(c => c && c.dispose());
      canvasEl.removeEventListener("pointerdown", onPointerDown);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerup", onPointerUp);
      canvasEl.removeEventListener("pointerleave", onPointerUp);
      canvasEl.removeEventListener("touchstart", onPointerDown);
      canvasEl.removeEventListener("touchmove", onPointerMove);
      canvasEl.removeEventListener("touchend", onPointerUp);
      renderer.dispose();
      renderer.forceContextLoss?.();
    };
  }, [scene]);

  // ---------- Validation ----------
  const validateScene = async (root) => {
    let error = null;
    root.traverse(obj => {
      if (obj.isMesh) {
        if (/[^\x20-\x7E]/.test(obj.name) || /\u3000/.test(obj.name)) {
          error = "オブジェクト名に2Byte文字か全角スペースが含まれています";
        }
      }
    });
    return error;
  };

  // ---------- Capture helper ----------
  const grabViews = async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas not ready");
    // 後続フレーム完了を待ち一番新しい描画を確実に
    await new Promise(r => requestAnimationFrame(r));

    const dpr = rendererRef.current.getPixelRatio();
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);

    const w1 = Math.floor(width * 0.75);
    const h1 = height;
    const w2 = Math.floor(width * 0.25);
    const h2 = Math.floor(height * 0.5);

    // WebGLバックバッファ全体を DataURL
    const dataUrl = canvas.toDataURL("image/png");
    const baseImage = new Image();
    baseImage.src = dataUrl;
    await new Promise(res => (baseImage.onload = res));

    // crop utility (image uses top-left origin)
    const crop = (sx, sy, sw, sh) => {
      const oc = document.createElement("canvas");
      oc.width = sw;
      oc.height = sh;
      const ctx = oc.getContext("2d");
      ctx.drawImage(baseImage, sx, sy, sw, sh, 0, 0, sw, sh);
      return new Promise((resolve, reject) => {
        oc.toBlob(b => (b ? resolve(b) : reject(new Error("Blob生成失敗"))), "image/png");
      });
    };

    // WebGL の (w1,h2) は「左下基準」。画像は「左上基準」なので変換:
    // imageY = totalHeight - (webglY + regionHeight)
    const mainBlob = await crop(0, height - (0 + h1), w1, h1);            // (0,0)
    const rtBlob = await crop(w1, height - (h2 + h2), w2, h2);             // (w1,h2)
    const rbBlob = await crop(w1, height - (0 + h2), w2, h2);              // (w1,0)

    return { mainBlob, rtBlob, rbBlob };
  };

  // ---------- Upload ----------
  const handleUpload = async () => {
    if (!fileToUpload || !scene) return;
    setIsUploading(true);
    setUploadStatus("");

      // ユーザー入力から英数字以外を除外（例：_ や - を削除）
  const normalizedPresenterId = presenterId.replace(/[^a-zA-Z0-9]/g, "");
  if (!normalizedPresenterId) {
    setUploadStatus("❌ 発表者番号には英数字が必要です（記号は使用不可）");
    setIsUploading(false);
    return;
  }

    let blobs;
    try {
      blobs = await grabViews();
    } catch (e) {
      setUploadStatus("❌ キャプチャ失敗: " + e.message);
      setIsUploading(false);
      return;
    }

    // yyyy_mm_dd_tttt形式を自動生成
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const autoPresenterId =
      now.getFullYear() + "_" +
      pad(now.getMonth() + 1) + "_" +
      pad(now.getDate()) + "_" +
      pad(now.getHours()) + pad(now.getMinutes());

    const formData = new FormData();
    formData.append("folder_id", autoPresenterId);      // ←自動生成
    formData.append("presenter_id", normalizedPresenterId);           // ←発表者番号として別名で送信する場合（下記説明参照）
    formData.append("passcode", passcode);             // ←入力値
    formData.append("file", fileToUpload);
    formData.append("view1", blobs.mainBlob, "view1.png");
    formData.append("view2", blobs.rtBlob, "view2.png");
    formData.append("view3", blobs.rbBlob, "view3.png");

    try {
      const res = await fetch("https://3dobjcttest.yashubustudioetc.com/api/upload.php", {
        method: "POST",
        body: formData
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "サーバーエラー");
      setUploadStatus(`✅ アップロード完了: ${result.presenter_id || "送信成功"}`);
    } catch (err) {
      setUploadStatus("❌ アップロード失敗: " + (err.message || "不明なエラー"));
    } finally {
      setIsUploading(false);
    }
  };


  // ---------- File Input ----------
  const handleFile = async (e) => {
    setScene(null);
    setFileToUpload(null);
    setUploadStatus("");
    modelInfo.current = { center: new THREE.Vector3(), size: 1 };

    const file = e.target.files?.[0];
    if (!file) return;

    const loadGltfFromUrl = (url, originalFile) => {
      new GLTFLoader().load(
        url,
        async gltf => {
          const errMsg = await validateScene(gltf.scene);
            if (errMsg) {
              alert(errMsg);
              URL.revokeObjectURL(url);
              return;
            }
            setScene(gltf.scene);
            setFileToUpload(originalFile);
        },
        undefined,
        err => console.error("GLTF load error:", err)
      );
    };

    if (file.name.toLowerCase().endsWith(".zip")) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fileMap = new Map();

      await Promise.all(
        Object.values(zip.files).map(async entry => {
          if (entry.dir) return;
          const blob = await entry.async("blob");
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
            fileMap.set(entry.name.replace(/\\/g, "/"), url);
        })
      );

      const gltfEntry = [...fileMap.keys()].find(k => k.toLowerCase().endsWith(".gltf"));
      if (!gltfEntry) {
        alert("ZIP 内に .gltf が見つかりません");
        return;
      }

      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => {
        const clean = url.split(/[?#]/)[0];
        const filename = clean.substring(clean.lastIndexOf("/") + 1);
        const match = [...fileMap.keys()].find(k => k.endsWith(filename));
        return match ? fileMap.get(match) : url;
      });

      new GLTFLoader(manager).load(
        fileMap.get(gltfEntry),
        async gltf => {
          const errMsg = await validateScene(gltf.scene);
          if (errMsg) {
            alert(errMsg);
            return;
          }
          setScene(gltf.scene);
          setFileToUpload(file);
        },
        undefined,
        err => console.error("GLTF load error:", err)
      );
    } else if (/\.(glb|gltf)$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      blobUrls.current.push(url);
      loadGltfFromUrl(url, file);
    } else {
      alert("対応形式: .zip(.gltf/.bin/textures) または .glb/.gltf");
    }
    e.target.value = "";
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Gltf Multi-View Viewer</h2>
      <input type="file" accept=".zip,.glb,.gltf" onChange={handleFile} style={{ marginBottom: 8 }} />
      <div style={{ margin: "16px 0", display: "flex", gap: "1rem" }}>
        <label>
          発表者番号：
          <input type="text" value={presenterId} onChange={e => setPresenterId(e.target.value)} placeholder="例: A1234"/>
        </label>
        <label>
          パスワード：
          <input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="vconf2025test"/>
        </label>
      </div>

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
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 10
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "75%",
              height: "100%",
              border: "3px solid #888",
              boxSizing: "border-box",
              borderRadius: 6
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "75%",
              top: 0,
              width: "25%",
              height: "50%",
              border: "3px solid #4c8",
              boxSizing: "border-box",
              borderRadius: 6
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "75%",
              top: "50%",
              width: "25%",
              height: "50%",
              border: "3px solid #c48",
              boxSizing: "border-box",
              borderRadius: 6
            }}
          />
        </div>
      </div>
      {scene && fileToUpload && (
        <>
          <button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "アップロード中..." : "このファイルを提出する"}
          </button>
          {isUploading && (
            <div
              style={{
                width: "100%",
                maxWidth: "600px",
                background: "#eee",
                height: "10px",
                margin: "8px auto",
                position: "relative",
                overflow: "hidden",
                borderRadius: "4px"
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#4caf50",
                  animation: "progress 2s infinite linear"
                }}
              />
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
