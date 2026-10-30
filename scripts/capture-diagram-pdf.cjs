// Visual export verification using a fresh isolated H2 desktop process and local fonts.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/test-evidence/diagram-checkpoint-c/exports');
const {buildSync}=require(path.join(root,'frontend/node_modules/esbuild'));
const {chromium}=require(path.join(root,'frontend/node_modules/@playwright/test'));
const dataDir=path.join(root,'.runtime/diagram-pdf-'+Date.now());
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(dataDir,{recursive:true});
const jdk=fs.readdirSync(path.join(root,'.runtime/java'),{withFileTypes:true}).find(f=>f.isDirectory()).name;
const java=path.join(root,'.runtime/java',jdk,'bin/java.exe');
const fd=fs.openSync(path.join(dataDir,'server.log'),'w');
const child=spawn(java,['-jar',path.join(root,'.runtime/desktop-build/figtide.jar'),'--spring.profiles.active=desktop','--labflow.desktop.open-browser=false','--labflow.desktop.tray=false','--labflow.data-dir='+dataDir,'--spring.datasource.url=jdbc:h2:file:'+path.join(dataDir,'labflow_e2e').replaceAll('\\','/')+';MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,LABFLOW_AGENT_API_KEY:''}});
(async()=>{let browser;try{
 let baseUrl;let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw new Error('Owned export server exited; see '+dataDir);try{const record=JSON.parse(fs.readFileSync(path.join(dataDir,'app.port'),'utf8'));baseUrl='http://127.0.0.1:'+record.port;const ping=await(await fetch(baseUrl+'/api/desktop/ping')).json();if(ping.instance_id!==record.instance_id)throw new Error('Owned desktop identity mismatch');const r=await fetch(baseUrl+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Isolated export server not ready');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(baseUrl+'/');
 const code=buildSync({stdin:{contents:"export {diagramPdf} from './frontend/src/diagram/export/pdf'; export {renderDiagram} from './frontend/src/diagram/render/renderDiagram';",resolveDir:root,sourcefile:'diagram-pdf-entry.ts'},bundle:true,write:false,format:'iife',globalName:'ExportVerification',platform:'browser'}).outputFiles[0].text;
 await page.addScriptTag({content:code});
 const base=path.join(root,'backend/src/main/resources/diagram'),template=JSON.parse(fs.readFileSync(path.join(base,'templates/mechanism.json'),'utf8')),style=JSON.parse(fs.readFileSync(path.join(base,'styles/nature-flat.json'),'utf8'));
 for(const language of ['en','zh']){const doc=template.documents[language];const bytes=await page.evaluate(async({doc,style})=>{const E=window.ExportVerification,svg=E.renderDiagram(doc,style),blob=await E.diagramPdf(svg,doc);return Array.from(new Uint8Array(await blob.arrayBuffer()));},{doc,style});fs.writeFileSync(path.join(out,'mechanism-'+language+'.pdf'),Buffer.from(bytes));}
 console.log('Real SVG-to-PDF exports: '+out);
}finally{if(browser)await browser.close();if(child.exitCode===null)child.kill();fs.closeSync(fd);}})().catch(e=>{console.error(e);process.exitCode=1;});
