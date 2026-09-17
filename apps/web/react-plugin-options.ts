import type { Options } from "@vitejs/plugin-react";

// Shared domain code also runs in workers, where React refresh globals do not exist.
export const reactPluginOptions: Options = {
  compiler: true,
  exclude: [/\/node_modules\//, /\/packages\/common\//, /\.worker\.[cm]?[jt]s$/],
};
