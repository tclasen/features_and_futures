import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { promises as fs } from "node:fs";
import sqlite from "node:sqlite";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), "workboard.db");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

let db;
async function initDb() {
 db = new sqlite.DatabaseSync(DB_PATH);
  db.prepare('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)').run();
}
function dbAll(sql, params) { return db.prepare(sql).all(params); }function dbGet(sql, params) { return db.prepare(sql).get(params); }function dbRun(sql, params) { return db.prepare(sql).run(params); }

function mime(ext) {
  const map = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };
  return map[ext] || "application/octet-stream";
}

async function serveFile(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mime(ext) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (pathname.startsWith("/api/")) {
    if (!db) await initDb();
    if (pathname === "/api/projects" && req.method === "GET") {
      const rows = dbAll("SELECT id, name FROM projects ORDER BY id ASC");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
      return;
    }
    if (pathname === "/api/projects" && req.method === "POST") {
      try {
        const body = await parseJson(req);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Project name is required" }));
          return;
        }
        const result = dbRun("INSERT INTO projects (name) VALUES (?)", name);
        const proj = { id: result.lastID, name };
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(proj));
        return;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
    }
    const match = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (match && req.method === "GET") {
      const proj = dbGet("SELECT id, name FROM projects WHERE id = ?", Number(match[1]));
      if (!proj) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Project not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(proj));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (pathname === "/" && req.method === "GET") {
    await serveFile(path.join(PUBLIC_DIR, "index.html"), res);
    return;
  }
  if (pathname.startsWith("/projects/") && req.method === "GET") {
    await serveFile(path.join(PUBLIC_DIR, "project.html"), res);
    return;
  }
  if (pathname.startsWith("/static/") && req.method === "GET") {
    const filePath = path.join(PUBLIC_DIR, pathname);
    await serveFile(filePath, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

await initDb();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

