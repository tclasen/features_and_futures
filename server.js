import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, archived INTEGER NOT NULL DEFAULT 0)`);
// Upgrade databases created by earlier checkpoints.
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
const listProjects = db.prepare('SELECT p.id,p.name,p.archived,COUNT(t.id) AS totalCount,COALESCE(SUM(t.completed),0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived=? GROUP BY p.id ORDER BY p.id');
const getProject = db.prepare('SELECT id,name,archived FROM projects WHERE id=?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived=? WHERE id=?');
const renameProject = db.prepare('UPDATE projects SET name=? WHERE id=? AND archived=0');
const listTasks = db.prepare('SELECT id,project_id AS projectId,title,completed FROM tasks WHERE project_id=? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id,title) VALUES (?,?)');
const updateTask = db.prepare('UPDATE tasks SET completed=? WHERE id=? AND project_id=? AND EXISTS (SELECT 1 FROM projects WHERE id=? AND archived=0)');
const htmlPath = fileURLToPath(new URL('./public/index.html', import.meta.url));
const jsPath = fileURLToPath(new URL('./public/app.js', import.meta.url));
const cssPath = fileURLToPath(new URL('./public/style.css', import.meta.url));
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(body)}
async function bodyJson(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>100000)throw new Error('Request too large')}return JSON.parse(data||'{}')}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');try{
 if(req.method==='GET'&&url.pathname==='/health')return send(res,200,JSON.stringify({status:'ok'}));
 if(req.method==='GET'&&url.pathname==='/api/projects')return send(res,200,JSON.stringify(listProjects.all(url.searchParams.get('archived')==='true'?1:0)));
 if(req.method==='POST'&&url.pathname==='/api/projects'){const data=await bodyJson(req),name=typeof data.name==='string'?data.name.trim():'';if(!name)return send(res,400,JSON.stringify({error:'Project name is required'}));const result=addProject.run(name);return send(res,201,JSON.stringify({id:Number(result.lastInsertRowid),name,archived:0}))}
 const archiveMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);if(req.method==='POST'&&archiveMatch){const result=setArchived.run(archiveMatch[2]==='archive'?1:0,Number(archiveMatch[1]));return result.changes?send(res,200,JSON.stringify({ok:true})):send(res,404,JSON.stringify({error:'Not found'}))}
 const tasksMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);if(tasksMatch){const id=Number(tasksMatch[1]),project=getProject.get(id);if(!project)return send(res,404,JSON.stringify({error:'Not found'}));if(req.method==='GET')return send(res,200,JSON.stringify(listTasks.all(id)));if(req.method==='POST'){if(project.archived)return send(res,403,JSON.stringify({error:'Archived project'}));const data=await bodyJson(req),title=typeof data.title==='string'?data.title.trim():'';if(!title)return send(res,400,JSON.stringify({error:'Task title is required'}));const result=addTask.run(id,title);return send(res,201,JSON.stringify({id:Number(result.lastInsertRowid),projectId:id,title,completed:0}))}}
 const taskMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);if(req.method==='PATCH'&&taskMatch){const data=await bodyJson(req);if(typeof data.completed!=='boolean')return send(res,400,JSON.stringify({error:'Invalid completion state'}));const id=Number(taskMatch[1]),result=updateTask.run(data.completed?1:0,Number(taskMatch[2]),id,id);return result.changes?send(res,200,JSON.stringify({ok:true})):send(res,404,JSON.stringify({error:'Not found'}))}
 const projectMatch=url.pathname.match(/^\/api\/projects\/(\d+)$/);if(projectMatch){const id=Number(projectMatch[1]);if(req.method==='GET'){const project=getProject.get(id);return project?send(res,200,JSON.stringify(project)):send(res,404,JSON.stringify({error:'Not found'}))}if(req.method==='PATCH'){const data=await bodyJson(req),name=typeof data.name==='string'?data.name.trim():'';if(!name)return send(res,400,JSON.stringify({error:'Project name is required'}));const result=renameProject.run(name,id);return result.changes?send(res,200,JSON.stringify(getProject.get(id))):send(res,404,JSON.stringify({error:'Not found or archived'}))}}
 if(req.method==='GET'&&(url.pathname==='/'||/^\/projects\/\d+$/.test(url.pathname)))return send(res,200,await readFile(htmlPath,'utf8'),'text/html; charset=utf-8');
 if(req.method==='GET'&&url.pathname==='/app.js')return send(res,200,await readFile(jsPath,'utf8'),'text/javascript; charset=utf-8');if(req.method==='GET'&&url.pathname==='/style.css')return send(res,200,await readFile(cssPath,'utf8'),'text/css; charset=utf-8');send(res,404,JSON.stringify({error:'Not found'}));
 }catch(error){send(res,error.message==='Request too large'?413:400,JSON.stringify({error:'Invalid request'}))}});
const port=Number(process.env.PORT||8080);server.listen(port,'0.0.0.0',()=>console.log(`Workboard listening on ${port}`));
