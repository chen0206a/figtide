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
