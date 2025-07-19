// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ObjViewer from "./pages/ObjViewer";
import GltfViewer from "./pages/GltfViewer";
import Gltfdb from "./pages/GltfZipViewerWithIDB";
import Check from "./pages/access_check";
import FbxViewer from "./pages/FbxZipViewerWithIDB";
import GltfNoLim from "./pages/GltfZipViewerWithUpload";
import LimUp from "./pages/LimUp";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<Home />} />
        <Route path="/LimUp"           element={<LimUp />} />
        <Route path="gltfnolim"   element={<GltfNoLim/>}/>
        <Route path="/viewer-obj" element={<ObjViewer />} />
        <Route path="/viewer-gltf" element={<GltfViewer />} />
        <Route path="/gltfdb" element={<Gltfdb/>}/>
        <Route path="/fbx"        element={<FbxViewer />} />
        <Route path="/check"      element={<Check/>} />
        <Route path="*"           element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
