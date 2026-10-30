// Standalone visual evidence from the production renderer, not snapshot acceptance.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.LABFLOW_DIAGRAM_EVIDENCE_DIR||'docs/test-evidence/diagram-checkpoint-a');
const {buildSync}=require(path.join(root,'frontend/node_modules/esbuild'));
const {chromium}=require(path.join(root,'frontend/node_modules/@playwright/test'));
const resource=p=>JSON.parse(fs.readFileSync(path.join(root,'backend/src/main/resources/diagram',p+'.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const code=buildSync({entryPoints:[path.join(__dirname,'diagram-evidence-entry.ts')],bundle:true,write:false,format:'iife',globalName:'Evidence',platform:'browser'}).outputFiles[0].text;
const styles=['nature-flat','soft-illustration','line-minimal','conference-framework','isometric','sketch'].map(id=>resource('styles/'+id));
const items=[['receptor','Receptor','actor'],['protein','Protein','actor'],['dimer','Dimer + P','process'],['ligand','Ligand','model'],['small-molecule','Small molecule','note'],['dna','DNA','process'],['cell-cluster','Cells','neutral'],['tube','Tube','actor'],['flask','Flask','actor'],['input-frames','Frames','actor'],['encoder','Encoder','actor'],['llm','LLM block','model'],['attention','Attention','note'],['tokens','Tokens','actor'],['layers','Stack','actor'],['dataset','Dataset','actor'],['result-bars','Result bars','process'],['text-input','Text input','neutral'],['laser','Laser','neutral'],['lens','Lens','actor'],['beam-splitter','Beam splitter','model'],['sample-stage','Sample','process'],['detector','Detector','note'],['energy-levels','Energy level','note'],['cell','Cell','neutral'],['vesicle','Vesicle','neutral'],['phospho','Phospho','note'],['frozen','Frozen','actor'],['trainable','Trainable','note'],['number','Number','neutral']];
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
 await page.addScriptTag({content:code});
 for(const style of styles){
  const svg=await page.evaluate(({style,items})=>{
   const E=window.Evidence,k=7.5;
   const cells=items.map(([kind,name,role],i)=>{
    const x=2+(i%8)*23,y=7+Math.floor(i/8)*34,resolved=E.roleColor(role),palette={...style,body_fill:resolved.fill,line_color:style.id==='line-minimal'?'#0E1116':resolved.stroke,accent_colors:[resolved.stroke,...style.accent_colors]};
    return `<g transform="translate(${x} ${y})"><g transform="translate(0 ${kind==='energy-levels'?10:0})">${E.glyphMarkup(kind,19,kind==='energy-levels'?1.8:kind==='receptor'?25:21,palette)}</g><text x="9.5" y="29" font-size="2.47" text-anchor="middle" fill="#1A1F26">${name}</text></g>`;
   }).join('');
   return `<svg xmlns="http://www.w3.org/2000/svg" width="${187*k}" height="${158*k}" viewBox="0 0 187 158" font-family="Arial"><rect width="187" height="158" fill="white"/><text x="2" y="4" font-size="2.8">Glyph sheet · ${style.id} · 7.5 px/mm</text>${cells}<g transform="translate(1 144)">${E.membraneMarkup(184,8,style)}</g><text x="184" y="156" text-anchor="end" font-size="2.47">Membrane (bilayer)</text></svg>`;
  },{style,items});
  fs.writeFileSync(path.join(out,`glyph-sheet-${style.id}.svg`),svg);
  await page.setContent('<style>body{margin:0;background:white}</style>'+svg);
  await page.locator('svg').screenshot({path:path.join(out,`glyph-sheet-${style.id}.png`)});
  await page.addScriptTag({content:code});
 }
 for(const palette of resource('palettes')){
  const doc=resource('templates/mechanism').documents.en;doc.style.palette=palette.id;
  const svg=await page.evaluate(({doc,style})=>window.Evidence.renderDiagram(doc,style),{doc,style:styles[0]});
  fs.writeFileSync(path.join(out,`mechanism-${palette.id}.svg`),svg);
  await page.setContent('<style>body{margin:0;background:white}svg{width:1350px;height:825px}</style>'+svg);
  await page.locator('svg').screenshot({path:path.join(out,`mechanism-${palette.id}.png`)});
  await page.addScriptTag({content:code});
 }
 for(const prefix of ['glyph-sheet-','mechanism-']){
  const files=fs.readdirSync(out).filter(f=>f.startsWith(prefix)&&f.endsWith('.png'));
  await page.setViewportSize({width:1440,height:Math.ceil(files.length/2)*620});
  const html=files.map(f=>`<div><p>${f}</p><img style="width:100%" src="data:image/png;base64,${fs.readFileSync(path.join(out,f)).toString('base64')}"/></div>`).join('');
  await page.setContent('<style>body{margin:12px;font:16px Arial;background:#f5f6f8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}p{margin:8px}</style><div class="grid">'+html+'</div>');
  await page.locator('.grid').screenshot({path:path.join(out,prefix+'overview.png')});
 }
 console.log('Evidence written: '+out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
