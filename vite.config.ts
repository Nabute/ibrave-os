import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "tanstack";
          }
          if (id.includes("node_modules/@supabase/")) {
            return "supabase";
          }
          if (id.includes("node_modules/recharts")) {
            return "charts";
          }
          return undefined;
        },
      },
    },
  },
});
