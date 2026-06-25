import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  // Relative base so the built site works from any GitHub Pages subpath
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
    // Allow Cloudflare quick-tunnel hosts for shareable preview links
    allowedHosts: [".trycloudflare.com"],
  },
});
