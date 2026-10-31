// Dedicated evidence for standalone P/number glyphs, using the production renderer.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.LABFLOW_DIAGRAM_EVIDENCE_DIR||'docs/test-evidence/diagram-19-A7-followup');
const {buildSync}=require(path.join(root,'frontend/node_modules/esbuild'));
const {chromium}=require(path.join(root,'frontend/node_modules/@playwright/test'));
const resource=p=>JSON.parse(fs.readFileSync(path.join(root,'backend/src/main/resources/diagram',p+'.json'),'utf8'));
const source=buildSync({entryPoints:[path.join(__dirname,'diagram-evidence-entry.ts')],bundle:true,write:false,format:'iife',globalName:'Evidence',platform:'browser'}).outputFiles[0].text;
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1700,height:900}});await page.addScriptTag({content:source});const samples=[];
  for(const id of ['nature-flat','soft-illustration','line-minimal','conference-framework','isometric','sketch']){
   const style=resource('styles/'+id),doc=resource('templates/mechanism').documents.en;
   doc.canvas={width_mm:72,height_mm:36,background:'#FFFFFF'};doc.style={preset:id,palette:'okabe-ito',overrides:{}};doc.zones=[];doc.edges=[];doc.annotations=[];doc.legend.mode='off';
   doc.nodes=[['phospho','Phospho',5,12,12,19],['number','Number',25,12,12,19],['dimer','Dimer + P',41,12,28,19]].map(([glyph,label,x,y,w,h],i)=>({id:'m'+i,kind:'glyph',glyph,label,x,y,w,h,label_pos:'below',boxed:false,badges:[],zone:null,icon:null,role:i===1?'data':'process',style_ref:null}));
   const svg=await page.evaluate(({doc,style})=>window.Evidence.renderDiagram(doc,style),{doc,style});fs.writeFileSync(path.join(out,'markers-'+id+'.svg'),svg);
   await page.setContent('<style>body{margin:0;background:white}svg{display:block;width:540px;height:270px}</style>'+svg);
   await page.locator('svg').screenshot({path:path.join(out,'markers-'+id+'.png')});samples.push({id,name:style.name,svg});await page.addScriptTag({content:source});
  }
  await page.setContent('<style>body{margin:20px;font:16px Arial;background:#f5f6f8}h1{font-size:22px}.grid{display:grid;grid-template-columns:repeat(3,540px);gap:16px}.card{background:white;border:1px solid #ddd}h2{font-size:16px;margin:12px}svg{display:block;width:540px;height:270px}</style><h1>独立 P / 编号 · 六种风格 · 7.5 px/mm · 右侧为二聚体 P 对照</h1><div class="grid">'+samples.map(s=>'<div class="card"><h2>'+s.name+' · '+s.id+'</h2>'+s.svg+'</div>').join('')+'</div>');
  await page.screenshot({path:path.join(out,'markers-six-styles.png'),fullPage:true});console.log('Six production-rendered marker samples: '+out);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
