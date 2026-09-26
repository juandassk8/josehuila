import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devApi } from "./devApi.js";

// https://vite.dev/config/
export default defineConfig({
  // devApi sirve las funciones de api/ en `npm run dev` (Vite solo sirve el
  // front; en prod las atiende Vercel). Es apply:"serve" → no afecta al build.
  plugins: [react(), devApi()],
  build: {
    rollupOptions: {
      output: {
        // Split large vendor libs into their own chunks so they no longer
        // inflate the main `index` entry. rolldown (vite 8) honors the
        // rollup-compatible manualChunks function form.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // React runtime — shared by every route.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }
          // Charting stack (recharts + its d3/victory deps).
          if (
            /[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|decimal\.js-light)[\\/]/.test(
              id,
            )
          ) {
            return "charts";
          }
          // Rich-text editor (TipTap + ProseMirror).
          if (/[\\/]node_modules[\\/](@tiptap|prosemirror-[^\\/]+)[\\/]/.test(id)) {
            return "editor";
          }
          // Onboarding tour (react-joyride) — solo se carga vía import dinámico.
          if (/[\\/]node_modules[\\/](react-joyride|react-floater|popper\.js)[\\/]/.test(id)) {
            return "joyride";
          }
          // Drag & drop (usado en Tareas / pipeline).
          if (/[\\/]node_modules[\\/]@dnd-kit[\\/]/.test(id)) {
            return "dnd-kit";
          }
          // Zoom/pan del canvas del despliegue.
          if (id.includes("react-zoom-pan-pinch")) {
            return "zoom-pan";
          }
        },
      },
    },
  },
});
