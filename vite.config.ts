import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "app",
      },
    }),
    react(),
  ],
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
