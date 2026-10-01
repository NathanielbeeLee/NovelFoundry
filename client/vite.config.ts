import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

interface DesktopPackageJson {
  version?: unknown;
}

function clearStaleOptimizeCache(rootDir: string): void {
  const cacheDir = path.resolve(rootDir, "node_modules/.vite");
  const depsDir = path.join(cacheDir, "deps");
  const metadataPath = path.join(depsDir, "_metadata.json");
  if (!fs.existsSync(metadataPath)) {
    return;
  }

  try {
    const rawMetadata = fs.readFileSync(metadataPath, "utf8");
    const metadata = JSON.parse(rawMetadata) as {
      optimized?: Record<string, { src?: string }>;
    };
    const hasMissingSource = Object.values(metadata.optimized ?? {}).some((entry) => {
      if (!entry?.src) {
        return false;
      }
      const resolvedSource = path.resolve(depsDir, entry.src);
      return !fs.existsSync(resolvedSource);
    });
    if (!hasMissingSource) {
      return;
    }
  } catch {
    // Broken metadata should be treated the same as stale metadata.
  }

  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.info("[vite] Cleared stale optimize cache because cached dependency sources no longer exist.");
}

function resolveDevProxyTarget(): string {
  const configuredHost = process.env.HOST?.trim();
  const port = Number(process.env.PORT ?? 3000);
  const targetHost = configuredHost && !["0.0.0.0", "::"].includes(configuredHost)
    ? configuredHost
    : "127.0.0.1";
  return `http://${targetHost}:${port}`;
}

function resolveDesktopAppVersion(): string {
  const desktopPackagePath = path.resolve(__dirname, "../desktop/package.json");
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8")) as DesktopPackageJson;
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`desktop/package.json version must be stable semver like 0.3.19, got ${version || "(empty)"}.`);
  }
  return version;
}

clearStaleOptimizeCache(__dirname);

const isDesktopRelativeBaseBuild = (process.env.NOVELFOUNDRY_CLIENT_BASE ?? process.env.AI_NOVEL_CLIENT_BASE) === "relative";
const appVersion = resolveDesktopAppVersion();

export default defineConfig({
  base: isDesktopRelativeBaseBuild ? "./" : "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@novelfoundry/shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replaceAll("\\", "/");
          // Shared runtime helpers must stay with the eagerly loaded runtime.
          if (
            modulePath === "\0vite/preload-helper.js" ||
            modulePath === "\0commonjsHelpers.js"
          ) {
            return "vendor";
          }

          const marker = "/node_modules/";
          const offset = modulePath.lastIndexOf(marker);
          if (offset < 0) {
            return undefined;
          }
          const parts = modulePath.slice(offset + marker.length).split("/");
          const packageName = parts[0].startsWith("@")
            ? parts.slice(0, 2).join("/")
            : parts[0];

          if (
            packageName.startsWith("@assistant-ui/") ||
            packageName === "@langchain/langgraph-sdk"
          ) {
            return "assistant-ui";
          }
          if (packageName === "platejs" || packageName.startsWith("@platejs/")) {
            return "plate-editor";
          }
          if (
            packageName.startsWith("@xyflow/") ||
            packageName.startsWith("d3-") ||
            packageName === "internmap"
          ) {
            return "graph";
          }
          // The syntax theme is imported by the app shell.
          if (packageName === "highlight.js" && modulePath.endsWith(".css")) {
            return "vendor";
          }
          if (
            ["react-markdown", "unified", "micromark", "vfile", "lowlight", "highlight.js"].includes(packageName) ||
            ["rehype-", "remark-", "micromark-", "mdast-", "hast-", "unist-", "vfile-"].some((prefix) => packageName.startsWith(prefix))
          ) {
            return "markdown";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: resolveDevProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
