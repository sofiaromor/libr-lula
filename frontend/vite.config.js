import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../catalogo",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/librelula": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
