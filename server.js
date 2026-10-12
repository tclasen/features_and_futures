import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const db=new DatabaseSync(process.env.DB_PATH||join(root,'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0);`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body)};const body=async()=>{let raw='';for await(const c of req)raw+=c;try{return JSON.parse(raw)}catch{return null}};
try{
if(url.pathname==='/health'&&req.method==='GET')return send(200,'{"status":"ok"}');
let m=url.pathname.match(/^\/api\/projects\/(\d+)(?:\/(tasks)(?:\/(\d+))?|\/(archive|restore))?$/);
if(m){const id=Number(m[1]), action=m[2] || m[4], project=db.prepare('SELECT * FROM projects WHERE id=?').get(id);if(!project)return send(404,JSON.stringify({error:'Project not found'}));
if(!action&&req.method==='PATCH'){const d=await body();if(typeof d?.name==='string'){const name=d.name.trim();if(!name)return send(400,JSON.stringify({error:'Project name is required'}));if(project.archived)return send(409,JSON.stringify({error:'Archived project'}));db.prepare('UPDATE projects SET name=? WHERE id=?').run(name,id);return send(200,JSON.stringify({id,name,archived:false}))}if(!d||!['archive','restore'].includes(d.action))return send(400,'{}');db.prepare('UPDATE projects SET archived=? WHERE id=?').run(d.action==='archive'?1:0,id);return send(200,'{"ok":true}')}
if(action==='tasks'&&req.method==='GET')return send(200,JSON.stringify(db.prepare('SELECT id,project_id AS projectId,title,completed FROM tasks WHERE project_id=? ORDER BY id').all(id)));
if(action==='tasks'&&req.method==='POST'){const d=await body(),title=typeof d?.title==='string'?d.title.trim():'';if(!title)return send(400,JSON.stringify({error:'Task title is required'}));if(project.archived)return send(409,JSON.stringify({error:'Archived project'}));const r=db.prepare('INSERT INTO tasks(project_id,title) VALUES(?,?)').run(id,title);return send(201,JSON.stringify({id:Number(r.lastInsertRowid),projectId:id,title,completed:0}))}
if(action==='tasks'&&m[3]&&req.method==='PATCH'){const d=await body();if(project.archived)return send(409,'{}');const taskId=Number(m[3]);if(typeof d?.title==='string'){const title=d.title.trim();if(!title)return send(400,JSON.stringify({error:'Task title is required'}));const r=db.prepare('UPDATE tasks SET title=? WHERE id=? AND project_id=?').run(title,taskId,id);return send(r.changes?200:404,JSON.stringify({id:taskId,projectId:id,title}))}if(typeof d?.completed!=='boolean')return send(400,'{}');const r=db.prepare('UPDATE tasks SET completed=? WHERE id=? AND project_id=?').run(+d.completed,taskId,id);return send(r.changes?200:404,'{}')}
}
if(url.pathname==='/api/projects'&&req.method==='GET')return send(200,JSON.stringify(db.prepare(`SELECT p.id,p.name,p.archived,COUNT(t.id) totalCount,COALESCE(SUM(t.completed),0) completedCount FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id`).all().map(p=>({...p,archived:!!p.archived}))));
if(url.pathname==='/api/projects'&&req.method==='POST'){const d=await body(),name=typeof d?.name==='string'?d.name.trim():'';if(!name)return send(400,JSON.stringify({error:'Project name is required'}));const r=db.prepare('INSERT INTO projects(name) VALUES(?)').run(name);return send(201,JSON.stringify({id:Number(r.lastInsertRowid),name,archived:false,totalCount:0,completedCount:0}))}
if(req.method==='GET'&&(url.pathname==='/'||url.pathname.startsWith('/projects/')))return send(200,await readFile(join(root,'public/index.html'),'utf8'),'text/html; charset=utf-8');
send(404,JSON.stringify({error:'Not found'}));}catch(e){console.error(e);send(500,JSON.stringify({error:'Internal server error'}))}});
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
