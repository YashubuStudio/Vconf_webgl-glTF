import React from "react";
import Glft from "./GltfZipViewerWithIDB";

export default function Home() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>glFTビューワー</h1>
      <p>
        単体の <code>.glb</code>
        または <code>.zip</code>（scene.gltf + scene.bin + textures） を
        アップロードしてください。
      </p>
      <p>投稿するモデルは以下の条件を満たしてください。</p>
      <ul>
        <li>ポリゴン数は 20,000 以下</li>
        <li>テクスチャは解像度 1K (960×540) 以下のものを 1 枚</li>
        <li>マテリアル数は 5 個以下</li>
        <li>オブジェクト名に 2 バイト文字や全角スペースを使用しない</li>
      </ul>
      <Glft/>
    </div>
  );
}
