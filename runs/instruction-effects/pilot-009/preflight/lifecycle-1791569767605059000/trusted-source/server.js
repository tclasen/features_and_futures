import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.env.DB_PATH);
db.exec("CREATE TABLE IF NOT EXISTS sentinel (value TEXT PRIMARY KEY); INSERT OR IGNORE INTO sentinel VALUES ('persisted');");
const fault = path.join(path.dirname(process.env.DB_PATH), 'fault');
fs.rmSync(fault, {force:true});
http.createServer((req,res) => {
  res.setHeader('Content-Type','application/json');
  if(req.url==='/health') return res.end(JSON.stringify({status:'ok'}));
  if(req.url==='/sentinel') return res.end(JSON.stringify({value:fs.existsSync(fault)?'missing':db.prepare('SELECT value FROM sentinel').get().value}));
  res.statusCode=404;res.end('{}');
}).listen(Number(process.env.PORT),'0.0.0.0');
