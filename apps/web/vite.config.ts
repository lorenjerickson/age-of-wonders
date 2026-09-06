import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

function prerenderPreviewPort(): Plugin {
  return {
    name: "aow:prerender-preview-port",
    enforce: "post",
    config: (_config, environment) => {
      if (environment.isPreview && process.env.TSS_PRERENDERING === "true") {
        return { preview: { port: 3103, strictPort: true } };
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: "src",
      pages: [
        { path: "/login" },
        { path: "/join" },
        { path: "/join/instance" },
        { path: "/join/session" },
      ],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
    }),
    react({ compiler: true }),
    tailwindcss(),
    nitro({ preset: "node-server", sourcemap: true }),
    // Nitro currently turns Start's ephemeral preview port (0) into 3000.
    // Keep build-time prerendering isolated from the Nest API on port 3000.
    prerenderPreviewPort(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true },
  },
  build: { sourcemap: true },
});
