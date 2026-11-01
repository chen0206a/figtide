import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';
import {readFileSync} from 'node:fs';

test('search a licensed vector → insert → D9 → preview repair → export SVG with attribution TXT',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json();expect(catalog.icons).toHaveLength(150);
  const icon=catalog.icons.find((i:{license:string})=>i.license==='CC-BY-4.0');
  const doc=structuredClone(catalog.templates.find((t:{id:string})=>t.id==='workflow').documents.en);doc.nodes=[];doc.edges=[];doc.zones=[];doc.annotations=[];
  const project=await(await request.post('/api/projects',{data:{name:'Scientific assets synthetic',description:'Licensed vector attribution fixture'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Licensed vector',doc}})).json();
  await page.setViewportSize({width:1440,height:960});await page.goto(`/projects/${project.id}/diagrams/${created.id}`);
  await page.getByRole('button',{name:'图标库',exact:true}).click();await page.getByRole('textbox',{name:'搜索科研图标'}).fill(icon.name.zh);
  await page.getByRole('button',{name:`插入图标 ${icon.name.zh}`,exact:true}).click();await expect(page.locator('[data-scientific-icon]')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'导出时附图标署名',exact:true}).uncheck();await page.getByRole('button',{name:'审稿这张图',exact:true}).click();const panel=page.getByRole('region',{name:'机制图审稿'});await panel.getByRole('button',{name:'运行审稿',exact:true}).click();
  await expect(panel.getByRole('checkbox',{name:'修复 需要附上图标署名',exact:true})).toBeChecked();await panel.getByRole('button',{name:'预览选中修复',exact:true}).click();await panel.getByRole('button',{name:'应用修复',exact:true}).click();await panel.getByRole('button',{name:'返回属性',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'导出时附图标署名',exact:true})).toBeChecked();
  if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-19-C/icon-library.png'),fullPage:false});
  await page.getByRole('button',{name:'导出机制图',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导出机制图',exact:true});await expect(dialog.getByRole('checkbox',{name:'附加图标署名',exact:true})).toBeChecked();await expect(dialog.getByRole('textbox',{name:'图标署名文本'})).toHaveValue(new RegExp(icon.author.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const downloads:import('@playwright/test').Download[]=[];page.on('download',d=>downloads.push(d));await dialog.getByRole('button',{name:'下载文件',exact:true}).click();await expect.poll(()=>downloads.length).toBe(2);
  const figure=downloads.find(d=>d.suggestedFilename().endsWith('.svg'))!,credits=downloads.find(d=>d.suggestedFilename().endsWith('-attribution.txt'))!;
  const file=artifactPath(info,'../docs/test-evidence/diagram-19-C/exports/licensed-icon.svg'),creditFile=artifactPath(info,'../docs/test-evidence/diagram-19-C/exports/licensed-icon-attribution.txt');await figure.saveAs(file);await credits.saveAs(creditFile);
  const svg=readFileSync(file,'utf8'),text=readFileSync(creditFile,'utf8');expect(svg).toContain('data-scientific-icon');expect(svg).not.toMatch(/<image|<script|foreignObject/);expect(text).toContain(icon.author);expect(text).toContain(icon.source_url);expect(text).toContain('CC BY 4.0');expect(text).toContain('modified');
  if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-19-C/icon-export-attribution.png'),fullPage:false});
});

test('reference SVG and PNG stay local → preview exact role colours → save parameters → apply → undo → reopen',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json(),doc=catalog.templates.find((t:{id:string})=>t.id==='mechanism').documents.en;
  const project=await(await request.post('/api/projects',{data:{name:'Local reference style synthetic',description:'Self generated reference files only'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Local style',doc}})).json(),endpoint=`/api/projects/${project.id}/diagrams/${created.id}`;
  const bodies:string[]=[],external:string[]=[];page.on('request',r=>{if(r.url().includes('must-not-fetch.invalid'))external.push(r.url());if(r.method()==='POST'||r.method()==='PUT')bodies.push(r.postData()||'');});
  await page.setViewportSize({width:1440,height:960});await page.goto(`/projects/${project.id}/diagrams/${created.id}`);await page.getByRole('button',{name:'参考风格',exact:true}).click();let dialog=page.getByRole('dialog',{name:'参考风格',exact:true});
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="110mm" viewBox="0 0 180 110"><rect width="180" height="110" fill="#FFFFFF"/><rect x="20" y="20" width="90" height="45" rx="2" fill="#0072B2" stroke="#009E73" stroke-width="1pt"/><circle cx="135" cy="45" r="18" fill="#D55E00"/><text x="10" y="90" font-family="Inter">PRIVATE_REFERENCE_TEXT</text><image href="https://must-not-fetch.invalid/private.png"/></svg>';
  await dialog.getByLabel('参考图片',{exact:true}).setInputFiles({name:'private-reference.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});await expect(dialog.getByRole('status')).toContainText('本地提取');expect(await(await request.get(`/api/projects/${project.id}/diagram-style-templates`)).json()).toHaveLength(0);
  await dialog.getByRole('button',{name:'预览提取风格',exact:true}).click();await expect(dialog.getByRole('region',{name:'参考配色色觉检查'})).toContainText('ΔE ≥ 20');
  await dialog.getByRole('textbox',{name:'参考风格名称'}).fill('Local source palette');await dialog.getByRole('button',{name:'保存参考风格',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('参考图未保存、未上传');
  const saved=await(await request.get(`/api/projects/${project.id}/diagram-style-templates`)).json();expect(saved).toHaveLength(1);expect(saved[0].profile.kind).toBe('diagram');expect(saved[0].profile.style.role_colors.actor).toMatch(/^#[0-9A-F]{6}$/);expect(saved[0].profile.style.overrides.line_width_pt).toBe(1);expect(JSON.stringify(saved)).not.toMatch(/PRIVATE_REFERENCE_TEXT|private-reference|<svg|data:image/);
  if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-19-C/reference-style.png'),fullPage:false});
  await dialog.getByRole('button',{name:'应用预览风格',exact:true}).click();await expect(dialog).not.toBeVisible();expect((await(await request.get(endpoint)).json()).revision).toBe(1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'重做',exact:true}).click();await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect.poll(async()=>(await(await request.get(endpoint)).json()).revision).toBe(2);expect((await(await request.get(endpoint)).json()).doc.style.role_colors).toEqual(saved[0].profile.style.role_colors);
  await page.reload();await page.getByRole('button',{name:'参考风格',exact:true}).click();dialog=page.getByRole('dialog',{name:'参考风格',exact:true});await dialog.locator('summary').filter({hasText:'已保存的参考风格'}).click();await dialog.getByRole('button',{name:'预览 Local source palette',exact:true}).click();await expect(dialog.getByRole('button',{name:'应用预览风格',exact:true})).toBeEnabled();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=60;const c=canvas.getContext('2d')!;c.fillStyle='white';c.fillRect(0,0,60,60);c.fillStyle='#0072B2';c.fillRect(10,10,20,40);c.fillStyle='#009E73';c.fillRect(30,10,20,40);return canvas.toDataURL('image/png').split(',')[1];});
  await dialog.getByLabel('参考图片',{exact:true}).setInputFiles({name:'generated-colors.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(dialog.getByRole('status')).toContainText('本地提取');await dialog.getByRole('button',{name:'预览提取风格',exact:true}).click();await expect(dialog.getByRole('region',{name:'参考配色色觉检查'})).toBeVisible();
  expect(external).toEqual([]);expect(bodies.join('\n')).not.toMatch(/PRIVATE_REFERENCE_TEXT|private-reference|<svg|data:image|generated-colors/);
});
