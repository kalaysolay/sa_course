// Локальный сервер макета для машин без Python; сторонние зависимости не нужны.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||5180);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
http.createServer((req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/courses.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 if(pathname.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"static_mockup_no_backend"}');return}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)});
}catch{res.writeHead(400);res.end()}}).listen(port,'127.0.0.1',()=>console.log(`AnalystGYM: http://127.0.0.1:${port}/course.html?id=interactive-course&lesson=visual`));
