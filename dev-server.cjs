// Development preview only. Production is served by GitHub Pages.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const args=process.argv.slice(2);const port=Number(args[args.indexOf('--port')+1])||4173;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml','.wasm':'application/wasm'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(__dirname,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(__dirname+path.sep))throw Error();const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'0.0.0.0',()=>console.log('Local: http://localhost:'+port));
