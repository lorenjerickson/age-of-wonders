import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3001,
  },
  // Keep manual production previews away from the Nest API's port.
  preview: {
    host: "127.0.0.1",
    port: 3103,
  },
  build: {
    sourcemap: true,
  },
  plugins: [
    tanstackStart({
      srcDirectory: "src",
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        pages: [{ path: "/" }],
      },
    }),
    react(),
    nitro({
      preset: "node-server",
      sourcemap: true,
    }),
  ],
});
