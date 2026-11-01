import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';
import {buildSync} from 'esbuild';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const bundle=buildSync({entryPoints:[resolve('../scripts/diagram-evidence-entry.ts')],bundle:true,write:false,format:'iife',globalName:'DiagramEvidence',platform:'browser'}).outputFiles[0].text;

test('all 12 templates × six styles × two languages pass actual geometry review with zero errors',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json();
  const project=await(await request.post('/api/projects',{data:{name:'All template geometry',description:'Synthetic SVG measurements only'}})).json();expect(project.id).toBeTruthy();
  await page.goto(`/projects/${project.id}/diagrams`);await page.addScriptTag({content:bundle});
  const results=[];
  for(const template of catalog.templates)for(const style of catalog.styles)for(const lang of ['en','zh']){
    const doc=structuredClone(template.documents[lang]);doc.style.preset=style.id;
    const facts=await page.evaluate(async({doc,style})=>(window as any).DiagramEvidence.collectDiagramFacts(doc,style),{doc,style});
    const response=await request.post(`/api/projects/${project.id}/diagram-tools/review`,{data:{protocol_version:1,doc,render_facts:facts}});
    const report=await response.json();results.push({template:template.id,style:style.id,language:lang,status:response.status(),issues:report.issues||report});
  }
  // Persist every failure before asserting, so layout fixes use measured evidence rather than snapshots.
  writeFileSync(artifactPath(info,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||'diagram-19-5'}/template-review.json`),JSON.stringify(results,null,2));
  const failures=results.filter(r=>r.status!==200||r.issues.some((i:{severity:string})=>i.severity==='error'));
  expect(failures).toEqual([]);expect(results).toHaveLength(144);
  const doc=structuredClone(catalog.templates.find((t:{id:string})=>t.id==='mechanism').documents.en);doc.nodes[0].label='PRIVATE_LABEL';doc.nodes[0].id='PRIVATE_NODE';for(const edge of doc.edges){if(edge.from==='n1')edge.from='PRIVATE_NODE';if(edge.to==='n1')edge.to='PRIVATE_NODE';}
  const facts=await page.evaluate(async({doc,style})=>(window as any).DiagramEvidence.collectDiagramFacts(doc,style),{doc,style:catalog.styles[0]});expect(JSON.stringify(facts)).not.toMatch(/PRIVATE_LABEL|PRIVATE_NODE|Cytokine|Receptor/);
  expect(await page.locator('body > div[style*="-20000px"]').count()).toBe(0);
  const glyphDoc=structuredClone(doc);glyphDoc.canvas.height_mm=240;glyphDoc.zones=[];glyphDoc.edges=[];glyphDoc.annotations=[];glyphDoc.legend.mode='off';
  glyphDoc.nodes=catalog.glyphs.map((g:{id:string},i:number)=>({id:`glyph${i}`,kind:'glyph',glyph:g.id,label:'',label_pos:'below',boxed:false,badges:g.id==='protein'?['phospho','number:2']:[],x:5+i%5*34,y:5+Math.floor(i/5)*30,w:28,h:24,zone:null,icon:null,role:'actor',style_ref:null}));
  const glyphFacts=await page.evaluate(async({doc,style})=>(window as any).DiagramEvidence.collectDiagramFacts(doc,style),{doc:glyphDoc,style:catalog.styles[0]});
  const glyphResponse=await request.post(`/api/projects/${project.id}/diagram-tools/review`,{data:{protocol_version:1,doc:glyphDoc,render_facts:glyphFacts}});expect(glyphResponse.status()).toBe(200);expect(glyphFacts.nodes).toHaveLength(31);

});

test('review → ignore → readonly fix preview → confirm → one undo → explicit save',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json(),doc=structuredClone(catalog.templates.find((t:{id:string})=>t.id==='workflow').documents.en);doc.style.overrides={font_size_pt:3,line_width_pt:.2};
  const project=await(await request.post('/api/projects',{data:{name:'Diagram review interaction',description:'Synthetic review and repair, no models'}})).json();expect(project.id).toBeTruthy();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'单细胞实验流程 · 审稿验收',doc}})).json();expect(created.id).toBeTruthy();
  const endpoint=`/api/projects/${project.id}/diagrams/${created.id}`;
  await page.setViewportSize({width:1440,height:960});await page.goto(`/projects/${project.id}/diagrams/${created.id}`);
  await page.getByRole('button',{name:'审稿这张图',exact:true}).click();const panel=page.getByRole('region',{name:'机制图审稿',exact:true});
  let sent:any;page.on('request',req=>{if(req.url().endsWith('/diagram-tools/review'))sent=req.postDataJSON();});
  await panel.getByRole('button',{name:'运行审稿',exact:true}).click();
  await expect(panel.getByRole('checkbox',{name:'修复 成品文字字号太小',exact:true})).toBeChecked();
  expect(JSON.stringify(sent.render_facts)).not.toMatch(/Tissue|Dissociation|Library|Sequencing/);
  await expect(page.locator('.diagram-review-markers [data-change-number]')).not.toHaveCount(0);
  const line=panel.locator('article').filter({hasText:'成品线宽太细'});await line.getByRole('button',{name:'忽略',exact:true}).click();await expect(line.getByRole('checkbox')).toBeDisabled();await line.getByRole('button',{name:'恢复',exact:true}).click();
  let frame=0;const folder=`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||'diagram-19-5'}`;
  async function shot(name:string){if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,`${folder}/${name}.png`),fullPage:true});}
  async function capture(){if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,`${folder}/review-gif-frames/${String(frame++).padStart(3,'0')}.png`)});}
  await shot('review-panel');await capture();
  await panel.getByRole('button',{name:'预览选中修复',exact:true}).click();await expect(panel.getByRole('button',{name:'应用修复',exact:true})).toBeInViewport();await expect(panel.getByRole('button',{name:'取消预览',exact:true})).toBeInViewport();await shot('repair-preview');await capture();
  expect((await(await request.get(endpoint)).json()).doc).toEqual(doc);expect((await(await request.get(endpoint)).json()).revision).toBe(1);
  await panel.getByRole('button',{name:'取消预览',exact:true}).click();await expect(panel.getByRole('button',{name:'应用修复',exact:true})).toHaveCount(0);await capture();
  await panel.getByRole('button',{name:'预览选中修复',exact:true}).click();await panel.getByRole('button',{name:'应用修复',exact:true}).click();await capture();
  expect((await(await request.get(endpoint)).json()).revision).toBe(1);await page.getByRole('button',{name:'撤销',exact:true}).click();await capture();
  await panel.getByRole('button',{name:'返回属性',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'画布字号',exact:true})).toHaveValue('3');
  await page.getByRole('button',{name:'重做',exact:true}).click();await page.getByRole('button',{name:'审稿这张图',exact:true}).click();await panel.getByRole('button',{name:'运行审稿',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('0 个 error');await shot('review-fixed');await capture();
  await page.getByRole('button',{name:'导出机制图',exact:true}).click();await expect(page.getByRole('dialog',{name:'导出机制图'})).toContainText('最近一次审稿没有error');await shot('export-reviewed');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect.poll(async()=>(await(await request.get(endpoint)).json()).revision).toBe(2);await capture();
});
