import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootEnvDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, "");
  const allowedHost = env.VITE_ALLOWED_HOST?.trim();

  return {
    envDir: rootEnvDir,
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: allowedHost ? [allowedHost] : [],
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true
        }
      }
    }
  };
});
