const fs = require("node:fs");
const path = require("node:path");

const { JSDOM } = require("jsdom");

const siteRoot = path.resolve(__dirname, "..");
const distRoot = path.join(siteRoot, "dist");
const templatePath = path.join(distRoot, "index.html");
const manifestPath = path.join(distRoot, ".vite", "manifest.json");
const configuredBase = process.env.SITE_BASE_PATH || "/";
const siteBase = `/${configuredBase.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const siteOrigin = (process.env.SITE_ORIGIN || "http://localhost:4173").replace(/\/+$/, "");

const notFoundPath = path.join(distRoot, "404.html");
if (fs.existsSync(notFoundPath)) {
  const notFoundSource = fs.readFileSync(notFoundPath, "utf8");
  fs.writeFileSync(notFoundPath, notFoundSource.replace("__SITE_BASE_PATH__", siteBase.replace(/\/$/, "")));
}

function normalizeManifestCandidate(candidate) {
  return candidate.replace(/\\/g, "/").replace(/^(\.\.\/)+/, "");
}

function addAssetCandidate(assetMap, candidate, file) {
  if (!candidate || !file) {
    return;
  }
  const normalized = normalizeManifestCandidate(candidate);
  const outputUrl = `${siteBase}${file}`;
  assetMap.set(`${siteBase}${normalized}`, outputUrl);
  assetMap.set(`${siteBase}${encodeURI(normalized)}`, outputUrl);
}

function loadAssetMap() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const assetMap = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    addAssetCandidate(assetMap, key, entry.file);
    addAssetCandidate(assetMap, entry.src, entry.file);
  }
  return assetMap;
}

function ensureMeta(document, attribute, key) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  return element;
}

function setMeta(document, attribute, key, value) {
  ensureMeta(document, attribute, key).setAttribute("content", value);
}

function setCanonical(document, href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function routeToOutputPaths(route) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  if (!cleanRoute) {
    return [path.join(distRoot, "index.html")];
  }
  return [
    path.join(distRoot, cleanRoute, "index.html"),
    path.join(distRoot, `${cleanRoute}.html`),
  ];
}

function rewriteAssetUrls(document, assetMap) {
  for (const element of document.querySelectorAll("[src], [href]")) {
    for (const attribute of ["src", "href"]) {
      const value = element.getAttribute(attribute);
      const replacement = value ? assetMap.get(value) : undefined;
      if (replacement) {
        element.setAttribute(attribute, replacement);
      }
    }
  }
}

function writeRoute(template, route, rendered, assetMap) {
  const dom = new JSDOM(template);
  const { document } = dom.window;
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("prerender: #root was not found in dist/index.html");
  }

  root.innerHTML = rendered.html;
  document.title = rendered.head.title;
  const canonical = `${siteOrigin}${siteBase}${route.replace(/^\/+/, "")}`;
  setMeta(document, "name", "description", rendered.head.description);
  setMeta(document, "property", "og:title", rendered.head.title);
  setMeta(document, "property", "og:description", rendered.head.description);
  setMeta(document, "property", "og:url", canonical);
  setMeta(document, "name", "twitter:title", rendered.head.title);
  setMeta(document, "name", "twitter:description", rendered.head.description);
  setCanonical(document, canonical);
  rewriteAssetUrls(document, assetMap);

  for (const outputPath of routeToOutputPaths(route)) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, dom.serialize());
  }
}

async function main() {
  const template = fs.readFileSync(templatePath, "utf8");
  const assetMap = loadAssetMap();
  const vite = await import("vite");
  const server = await vite.createServer({
    root: siteRoot,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
  });

  try {
    const entry = await server.ssrLoadModule("/src/prerender-entry.tsx");
    const routes = entry.getPrerenderRoutes();
    for (const route of routes) {
      writeRoute(template, route, entry.renderRoute(route), assetMap);
    }
    console.log(`prerendered ${routes.length} routes into ${path.relative(process.cwd(), distRoot)}`);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
