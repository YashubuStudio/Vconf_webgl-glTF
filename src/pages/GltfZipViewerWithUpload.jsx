import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  Box,
  Button,
  Typography,
  TextField,
  LinearProgress
} from "@mui/material";

// ====== ★★ すべての検証項目をリスト形式で返す関数 ★★ ======
async function validateSceneWithDetails(root, gltf) {
  const results = [];
  let ok = true;

  // 1. 全角文字・2バイト文字チェック
  let badNames = [];
  root.traverse(obj => {
    [obj.name, obj?.material?.name, obj?.geometry?.name]
      .filter(Boolean)
      .forEach(n => {
        if (/[^\x20-\x7E]/.test(n) || /\u3000/.test(n)) badNames.push(n);
      });
  });
  if (badNames.length) {
    ok = false;
    results.push({
      ok: false,
      label: "ファイル名・オブジェクト名・メッシュ名等",
      detail: `「${badNames[0].slice(0, 3)}${badNames[0].length > 3 ? "...": ""}」が検出されました`
    });
  } else {
    results.push({
      ok: true,
      label: "ファイル名・オブジェクト名・メッシュ名等",
      detail: "全て半角英数字です"
    });
  }

  // 2. サイズ
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const sizeText = `x ${size.x.toFixed(2)}m, y ${size.y.toFixed(2)}m, z ${size.z.toFixed(2)}m`;
  if (size.x > 2 || size.y > 2 || size.z > 2) {
    ok = false;
    results.push({ ok: false, label: "モデルサイズ", detail: `${sizeText} <2.00m` });
  } else {
    results.push({ ok: true, label: "モデルサイズ", detail: sizeText });
  }

  // 3. ポリゴン数
  let totalPoly = 0;
  root.traverse(obj => {
    if (obj.isMesh && obj.geometry) {
      let count = 0;
      if (obj.geometry.index) {
        count = obj.geometry.index.count / 3;
      } else if (obj.geometry.attributes.position) {
        count = obj.geometry.attributes.position.count / 3;
      }
      totalPoly += count;
    }
  });
  if (totalPoly > 20000) {
    ok = false;
    results.push({ ok: false, label: "ポリゴン数", detail: `${totalPoly} <20000` });
  } else {
    results.push({ ok: true, label: "ポリゴン数", detail: `${totalPoly}` });
  }

  // 4. アニメーション
  if (gltf.animations && gltf.animations.length > 0) {
    ok = false;
    results.push({ ok: false, label: "アニメーション", detail: "アニメーションが含まれています" });
  } else {
    results.push({ ok: true, label: "アニメーション", detail: "アニメーションは含まれていません" });
  }

  // 5. テクスチャ
  let textureCount = 0, over1k = false, textureRes = [];
  root.traverse(obj => {
    if (obj.material && obj.material.map && obj.material.map.image) {
      textureCount++;
      const img = obj.material.map.image;
      textureRes.push(`${img.width || "?"}x${img.height || "?"}`);
      if ((img.width && img.width > 1024) || (img.height && img.height > 1024)) {
        over1k = true;
      }
    }
  });
  if (textureCount > 1) {
    ok = false;
    results.push({ ok: false, label: "テクスチャ", detail: `テクスチャ枚数 ${textureCount}枚 <1枚` });
  } else if (over1k) {
    ok = false;
    results.push({ ok: false, label: "テクスチャ", detail: `解像度 ${textureRes[0]||"?"} >1024x1024` });
  } else {
    results.push({ ok: true, label: "テクスチャ", detail: `テクスチャ枚数 ${textureCount}枚, 解像度 ${textureRes[0]||"?"}` });
  }

  // 備考（マテリアル数）
  //let materialSet = new Set();
  //root.traverse(obj => obj.material && materialSet.add(obj.material));
  //results.push({ ok: null, label: "備考", detail: `マテリアル数: ${materialSet.size}` });

  // 6. マテリアル数チェック（上限5）
  let materialSet = new Set();
  root.traverse(obj => {
    if (obj.material) {
      // 複数マテリアルがあるMesh（Array）も対応
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => materialSet.add(m));
      } else {
        materialSet.add(obj.material);
      }
    }
  });
  const materialCount = materialSet.size;
  if (materialCount > 5) {
    ok = false;
    results.push({
      ok: false,
      label: "マテリアル数",
      detail: `${materialCount}個 > 上限5個`
    });
  } else {
    results.push({
      ok: true,
      label: "マテリアル数",
      detail: `${materialCount}個`
    });
  }

  // シェーダー警告
  let nonUnlit = false;
  root.traverse(obj => {
    if (obj.material && obj.material.type !== "MeshBasicMaterial") {
      nonUnlit = true;
    }
  });
  if (nonUnlit) {
    results.push({ ok: null, label: "シェーダー", detail: "Unlit系推奨（警告）" });
  }

  return { ok, results };
}

export default function GltfZipViewerWithUpload() {
  const [scene, setScene] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [presenterId, setPresenterId] = useState("");
  const [passcode, setPasscode] = useState("");

  // ★★★ ここで検証結果を保持 ★★★
  const [validationResults, setValidationResults] = useState(null);
  const [validationOk, setValidationOk] = useState(false);

  const blobUrls = useRef([]);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const controls = useRef([]);
  const cameras = useRef([]);
  const animationRef = useRef(null);
  const modelInfo = useRef({ center: new THREE.Vector3(), size: 1 });

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

  useEffect(() => {
    if (!scene || !canvasRef.current) return;

    const canvasEl = canvasRef.current;
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    modelInfo.current = { center, size };

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

    if (!scene.getObjectByName("__autolight_ambient")) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      ambient.name = "__autolight_ambient";
      const direct = new THREE.DirectionalLight(0xffffff, 1.2);
      direct.position.set(center.x + size, center.y + size, center.z + size);
      direct.name = "__autolight_dir";
      scene.add(ambient, direct);
    }

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

    controls.current = cameras.current.map((cam, index) => {
      const ctrl = new OrbitControls(cam, canvasEl);
      ctrl.target.copy(center);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      ctrl.screenSpacePanning = false;
      if (index === 1 || index === 2) {
        ctrl.enableRotate = false;
        ctrl.enablePan = false;
        ctrl.enableZoom = true;
      }
      return ctrl;
    });

    const getActiveView = (x, y, width, height) => {
      const w1 = width * 0.75;
      const h2 = height * 0.5;
      if (x < w1) return 0;
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
    const onPointerUp = () => {};

    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerUp);
    canvasEl.addEventListener("touchstart", onPointerDown, { passive: true });
    canvasEl.addEventListener("touchmove", onPointerMove, { passive: true });
    canvasEl.addEventListener("touchend", onPointerUp);

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

      renderer.setViewport(0, 0, w1, h1);
      renderer.setScissor(0, 0, w1, h1);
      cameras.current[0].aspect = w1 / h1;
      cameras.current[0].updateProjectionMatrix();
      renderer.render(scene, cameras.current[0]);

      renderer.setViewport(w1, h2, w2, h2);
      renderer.setScissor(w1, h2, w2, h2);
      cameras.current[1].aspect = w2 / h2;
      cameras.current[1].updateProjectionMatrix();
      renderer.render(scene, cameras.current[1]);

      renderer.setViewport(w1, 0, w2, h2);
      renderer.setScissor(w1, 0, w2, h2);
      cameras.current[2].aspect = w2 / h2;
      cameras.current[2].updateProjectionMatrix();
      renderer.render(scene, cameras.current[2]);

      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

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

  // ========== ファイル検証部 =============
  const handleFile = async (e) => {
    setScene(null);
    setFileToUpload(null);
    setUploadStatus("");
    setValidationResults(null);
    setValidationOk(false);
    modelInfo.current = { center: new THREE.Vector3(), size: 1 };

    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.(glb)$/i.test(file.name)) {
      alert("提出形式は .glb のみです");
      return;
    }

    const url = URL.createObjectURL(file);
    blobUrls.current.push(url);

    new GLTFLoader().load(
      url,
      async gltf => {
        const { ok, results } = await validateSceneWithDetails(gltf.scene, gltf);
        setValidationResults(results);
        setValidationOk(ok);

        if (!ok) {
          // エラーのみ抜き出し
          const errMsg = results
            .filter(x => x.ok === false)
            .map(x => `×${x.label}: ${x.detail}`)
            .join("\n");
          alert("募集要項の制限に違反している物があります\n" + errMsg);
          URL.revokeObjectURL(url);
          return;
        }
        setScene(gltf.scene);
        setFileToUpload(file);
      },
      undefined,
      err => {
        alert("GLB読み込みに失敗しました: " + err.message);
        URL.revokeObjectURL(url);
      }
    );

    e.target.value = "";
  };

  // ========== アップロード ==============
  const grabViews = async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas not ready");
    await new Promise(r => requestAnimationFrame(r));
    const dpr = rendererRef.current.getPixelRatio();
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    const w1 = Math.floor(width * 0.75);
    const h1 = height;
    const w2 = Math.floor(width * 0.25);
    const h2 = Math.floor(height * 0.5);
    const dataUrl = canvas.toDataURL("image/png");
    const baseImage = new window.Image();
    baseImage.src = dataUrl;
    await new Promise(res => (baseImage.onload = res));
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
    const mainBlob = await crop(0, height - (0 + h1), w1, h1);
    const rtBlob = await crop(w1, height - (h2 + h2), w2, h2);
    const rbBlob = await crop(w1, height - (0 + h2), w2, h2);
    return { mainBlob, rtBlob, rbBlob };
  };

  const handleUpload = async () => {
    if (!fileToUpload || !scene) return;
    setIsUploading(true);
    setUploadStatus("");

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

    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const autoPresenterId =
      now.getFullYear() + "_" +
      pad(now.getMonth() + 1) + "_" +
      pad(now.getDate()) + "_" +
      pad(now.getHours()) + pad(now.getMinutes());

    const formData = new window.FormData();
    formData.append("folder_id", autoPresenterId);
    formData.append("presenter_id", normalizedPresenterId);
    formData.append("passcode", passcode);
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

  // ========== UI部 ==========

return (
  <Box sx={{ p: 1.5 }}>
    {/* 上部：ファイル選択 + 入力 + 検証結果（2カラム） */}
    <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
      {/* 左：ファイル選択とテキスト入力 */}
      <Box sx={{ flex: 1, minWidth: 300 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Gltf Multi-View Viewer
        </Typography>
        <Button variant="contained" component="label" sx={{ mb: 1.5 }}>
          ファイルを選択
          <input hidden type="file" accept=".glb" onChange={handleFile} />
        </Button>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <TextField
            label="発表者番号"
            value={presenterId}
            onChange={e => setPresenterId(e.target.value)}
            placeholder="例: A1234"
            size="small"
            fullWidth
          />
          <TextField
            label="パスワード"
            type="password"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            placeholder="vconf2025test"
            size="small"
            fullWidth
          />
        </Box>
      </Box>

      {/* 右：検証結果（2列表示、圧縮） */}
      {validationResults && (
        <Box
          sx={{
            flex: 1,
            minWidth: 340,
            border: "1px solid #aaa",
            borderRadius: 2,
            bgcolor: "#fafafa",
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontSize: "0.95em", mb: 1 }}>
            検証結果
          </Typography>
          {validationResults.length > 0 && (
            <>
              {/* 1行目：全幅 */}
              <Box sx={{ mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: "0.8em",
                    lineHeight: 1.1,
                    color: validationResults[0].ok === false ? "#b00" : "#093",
                    fontWeight: validationResults[0].ok === false ? "bold" : "normal",
                  }}
                >
                  {(validationResults[0].ok === false ? "×" : "〇") + " "}
                  {validationResults[0].label}：{validationResults[0].detail}
                </Typography>
              </Box>

              {/* 残り2列 */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  columnGap: 2,
                  rowGap: 0.5,
                }}
              >
                {validationResults.slice(1).map((item, idx) => (
                  <Typography
                    key={idx}
                    sx={{
                      fontSize: "0.8em",
                      lineHeight: 1.1,
                      color: item.ok === false ? "#b00" : item.ok === true ? "#093" : "#333",
                      fontWeight: item.ok === false ? "bold" : "normal",
                    }}
                  >
                    {(item.ok === false ? "×" : item.ok === true ? "〇" : "・") + " "}
                    {item.label}：{item.detail}
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>

    {/* 3Dビュー */}
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "600px",
        border: "1px solid #bbb",
        marginTop: 20,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: "#e0e0e0",
          touchAction: "none",
          cursor: "grab",
        }}
      />
      {/* 分割枠 */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 10,
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
            borderRadius: 6,
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
            borderRadius: 6,
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
            borderRadius: 6,
          }}
        />
      </div>
    </div>

    {/* アップロードボタン・ステータス */}
    <Box
      sx={{
        mt: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Button
        variant="contained"
        onClick={handleUpload}
        disabled={!scene || !fileToUpload || !validationOk || isUploading}
        sx={{
          maxWidth: 340,
          width: "100%",
          mx: "auto",
          mb: 1.5,
          fontSize: "1.05rem",
          bgcolor: !validationOk ? "#bbb" : undefined,
          color: !validationOk ? "#fff" : undefined,
          cursor: !validationOk ? "not-allowed" : undefined,
        }}
      >
        {isUploading
          ? "アップロード中..."
          : validationOk
          ? "このファイルを提出する"
          : "検証に合格するとアップロード可能"}
      </Button>

      {isUploading && (
        <LinearProgress sx={{ width: "100%", maxWidth: 340, my: 0.5 }} />
      )}

      {uploadStatus && (
        <Typography
          sx={{
            mt: 0.5,
            fontSize: "0.9em",
          }}
          color={uploadStatus.startsWith("✅") ? "green" : "error"}
        >
          {uploadStatus}
        </Typography>
      )}
    </Box>
  </Box>
);
}
