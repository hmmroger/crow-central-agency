import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5101,
    strictPort: true, // Optional: if true, Vite will exit if the port is already in use
    proxy: {
      "/api": "http://localhost:3030",
      "/ws": {
        target: "ws://localhost:3030",
        ws: true,
      },
    },
  },
});
