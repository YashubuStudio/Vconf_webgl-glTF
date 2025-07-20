import React from "react";
import Glft from "./GltfZipViewerWithUpload";
import { Box } from "@mui/material";

export default function Home() {
  return (
    <Box sx={{ p: 2 }}>
      <Glft />
    </Box>
  );
}
