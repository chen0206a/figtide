const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'docs/test-evidence/diagram-checkpoint-b');
const {chromium}=require(path.join(root,'frontend/node_modules/@playwright/test'));
const {buildSync}=require(path.join(root,'frontend/node_modules/esbuild'));
const source=buildSync({entryPoints:[path.join(__dirname,'diagram-evidence-entry.ts')],bundle:true,write:false,format:'iife',globalName:'Evidence',platform:'browser'}).outputFiles[0].text;
const data=file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:2880,height:1000}});
 for(const [name,reference] of [['mechanism','19-2-editor.png'],['framework','12-2-ml-editor.png']]){
  const actual=path.join(out,name+'-1440.png');if(!fs.existsSync(actual))continue;
  const ref=path.join(root,'docs/development/design/19-screens',reference);
  await page.setContent(`<style>body{margin:0;font:20px Arial}.grid{display:grid;grid-template-columns:1440px 1440px}h3{height:40px;margin:0;padding:8px;box-sizing:border-box}img{width:1440px;height:960px;object-fit:contain;object-position:top;background:#f5f6f8}</style><div class="grid"><div><h3>当前实现 · ${name} · 1440 × 960</h3><img src="${data(actual)}"/></div><div><h3>原始设计参考 · ${reference}</h3><img src="${data(ref)}"/></div></div>`);
  await page.screenshot({path:path.join(out,'compare-'+name+'.png'),fullPage:true});
 }
 const base=path.join(root,'backend/src/main/resources/diagram'),style=JSON.parse(fs.readFileSync(path.join(base,'styles/nature-flat.json'),'utf8'));
 const templates=fs.readdirSync(path.join(base,'templates')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(base,'templates',f),'utf8')));
 await page.setViewportSize({width:1200,height:1050});await page.setContent('<style>body{margin:20px;font:16px Arial;background:#f5f6f8}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:12px;background:white;border:1px solid #ddd}svg{width:100%;height:auto;display:block}</style><h2>12 个模板缩略图 · 线宽下限1px</h2><div class="grid"></div>');await page.addScriptTag({content:source});
 await page.evaluate(({templates,style})=>{document.querySelector('.grid').innerHTML=templates.map(t=>`<div class="card"><p>${t.name} · ${t.id}</p>${window.Evidence.renderDiagram(t.documents.en,style,true)}</div>`).join('');},{templates,style});
 await page.screenshot({path:path.join(out,'templates-overview.png'),fullPage:true});
 console.log('Comparisons and thumbnail overview: '+out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
