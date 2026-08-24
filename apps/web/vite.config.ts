import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true },
  },
  build: { sourcemap: true },
});
