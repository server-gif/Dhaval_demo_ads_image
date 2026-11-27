// Local preview only (Vercel doesn't need this file).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
const staticFiles = new Set(["index.html", "upload.html", "styles.css", "app.js"]);

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = url === "/" ? path.join(__dirname, "index.html")
    : url.startsWith("/images/") ? path.join(__dirname, "images", path.basename(url))
    : staticFiles.has(url.slice(1)) ? path.join(__dirname, url.slice(1)) : null;
  const type = file && types[path.extname(file).toLowerCase()];
  if (!type || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
