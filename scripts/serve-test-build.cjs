const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
// Repository-owned production transport promoted from the task 09 acceptance runner.
const root=path.resolve(__dirname,'../frontend/dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.ico':'image/x-icon'};
const server=http.createServer((request,response)=>{
 if(request.url.startsWith('/api/')){
  const upstream=http.request({hostname:'127.0.0.1',port:8087,path:request.url,method:request.method,headers:{...request.headers,host:'127.0.0.1:8087'}},reply=>{
   response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);
  });
  upstream.on('error',error=>{if(!response.headersSent)response.writeHead(502);response.end(error.message)});
  request.pipe(upstream);return;
 }
 if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
 let file;
 try{file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname));}
 catch{response.writeHead(400);response.end();return;}
 if(file!==root&&!file.toLowerCase().startsWith((root+path.sep).toLowerCase())){response.writeHead(403);response.end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
  if(new URL(request.url,'http://127.0.0.1').pathname.startsWith('/assets/')){response.writeHead(404);response.end();return;}
  file=path.join(root,'index.html');
 }
 response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
 if(request.method==='HEAD'){response.end();return;}
 fs.createReadStream(file).on('error',()=>response.destroy()).pipe(response);
});
server.listen(5178,'127.0.0.1',()=>console.log(`Production test transport ready; PID ${process.pid}; API forwarded to 8087.`));
process.on('SIGTERM',()=>{console.log('Received SIGTERM');server.close(()=>process.exit(0));});
process.on('exit',code=>console.log(`Static test transport exit: ${code}`));
