import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 프론트엔드(5173) → 백엔드(3001) 프록시 설정
// /api/... 요청을 백엔드 서버로 자동 전달
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
