import { readNovelFoundryEnv } from "./brandingCompatibility";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_NAME = "NovelFoundry";
const LEGACY_APP_NAME = "AI-Novel-Writing-Assistant-v2";
const PORTABLE_DATA_SUFFIX = "-data";

export interface DesktopRuntimeConfig {
  mode: "desktop";
  apiBaseUrl: string;
  apiTimeoutMs: number;
  isPackaged: boolean;
  appVersion: string;
  isPortable: boolean;
  updateChannel: string;
}

function resolvePortableDesktopAppDataDir(): string | null {
  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim();
  if (!portableExecutableDir) {
    return null;
  }

  const portableAppName = process.env.PORTABLE_EXECUTABLE_APP_FILENAME?.trim() || APP_NAME;
  return path.join(portableExecutableDir, `${portableAppName}${PORTABLE_DATA_SUFFIX}`);
}

export function isPortableDesktopRuntime(): boolean {
  return resolvePortableDesktopAppDataDir() != null;
}

function resolveNamedDesktopAppDataDir(appName: string): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return path.join(localAppData, appName);
  }

  const appData = process.env.APPDATA?.trim();
  if (appData) {
    return path.join(appData, appName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }

  return path.join(os.homedir(), `.${appName}`);
}

export function resolveLegacyDesktopAppDataDir(): string | null {
  if (readNovelFoundryEnv("APP_DATA_DIR")?.trim() || isPortableDesktopRuntime()) {
    return null;
  }
  return resolveNamedDesktopAppDataDir(LEGACY_APP_NAME);
}

export function resolveDesktopAppDataDir(): string {
  const configuredDir = readNovelFoundryEnv("APP_DATA_DIR")?.trim();
  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  const portableDataDir = resolvePortableDesktopAppDataDir();
  if (portableDataDir) {
    return portableDataDir;
  }

  return resolveNamedDesktopAppDataDir(APP_NAME);
}

export function resolveDesktopLogsDir(): string {
  return path.join(resolveDesktopAppDataDir(), "logs");
}

export function resolveDesktopMainLogFile(): string {
  return path.join(resolveDesktopLogsDir(), "desktop-main.log");
}

export function resolveDesktopUpdateChannel(): string {
  const configuredChannel = readNovelFoundryEnv("UPDATE_CHANNEL")?.trim();
  return configuredChannel || "beta";
}

export function resolveDesktopRuntimeConfig(options: {
  port: number;
  isPackaged: boolean;
  appVersion: string;
  updateChannel?: string;
}): DesktopRuntimeConfig {
  return {
    mode: "desktop",
    apiBaseUrl: `http://127.0.0.1:${options.port}/api`,
    apiTimeoutMs: 10 * 60 * 1000,
    isPackaged: options.isPackaged,
    appVersion: options.appVersion,
    isPortable: isPortableDesktopRuntime(),
    updateChannel: options.updateChannel ?? resolveDesktopUpdateChannel(),
  };
}

export function resolveRendererDevUrl(): string {
  return readNovelFoundryEnv("DESKTOP_RENDERER_URL")?.trim() || "http://127.0.0.1:5173";
}

export function resolveDesktopResourcesDir(): string {
  const configuredDir = readNovelFoundryEnv("DESKTOP_RESOURCES_DIR")?.trim();
  return configuredDir ? path.resolve(configuredDir) : process.resourcesPath;
}

export function resolveRendererIndexHtml(): string {
  return path.join(resolveDesktopResourcesDir(), "client", "dist", "index.html");
}

export function resolveDesktopWindowIcon(): string {
  const configuredIconPath = readNovelFoundryEnv("DESKTOP_ICON_PATH")?.trim();
  if (configuredIconPath) {
    return path.resolve(configuredIconPath);
  }

  const packagedIconPath = path.join(resolveDesktopResourcesDir(), "icons", "app-icon.ico");
  if (fs.existsSync(packagedIconPath)) {
    return packagedIconPath;
  }

  return path.resolve(resolveWorkspaceRoot(), "desktop", "builder", "app-icon.ico");
}

export function resolvePackagedServerEntry(): string {
  return path.join(
    resolveDesktopResourcesDir(),
    "app.asar",
    "node_modules",
    "@novelfoundry",
    "server",
    "dist",
    "app.js",
  );
}

export function resolveWorkspaceRoot(): string {
  return path.resolve(__dirname, "../../..");
}
