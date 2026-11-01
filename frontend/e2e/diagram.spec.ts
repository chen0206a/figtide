import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';
import {readFileSync,writeFileSync} from 'node:fs';
async function openLayers(page:any){if(!await page.locator('.diagram-layers').evaluate((el:HTMLDetailsElement)=>el.open))await page.locator('.diagram-layers summary').click();}
test('diagram wizard → scientific glyphs → edits → style undo → save → conflict → version restore',async({page,request},testInfo)=>{
  const project=await(await request.post('/api/projects',{data:{name:`机制图合成验收 ${Date.now()}`,description:'Synthetic diagram fixture. No user data or model calls.'}})).json();
  await page.goto(`/projects/${project.id}/diagrams`);
  await page.getByRole('button',{name:'新建机制图',exact:true}).click();
  const wizard=page.getByRole('region',{name:'新建机制图'});
  await wizard.getByRole('button',{name:'分区机制',exact:true}).click();
  await page.screenshot({path:artifactPath(testInfo,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||"diagram-19-A-acceptance"}/diagram-new.png`),fullPage:true});
  await wizard.getByRole('button',{name:'Nature 扁平',exact:true}).click();
  await wizard.getByRole('textbox',{name:'机制图名称'}).fill('Synthetic mechanism acceptance');await wizard.getByRole('combobox',{name:'成品规格'}).selectOption('double');
  await wizard.getByRole('button',{name:'创建机制图',exact:true}).click();
  await expect(page.getByRole('main',{name:'机制图编辑器'})).toBeVisible();await expect(page.getByTestId('diagram-canvas').locator('[data-scientific-glyph="receptor"]')).toHaveCount(1);
  const id=Number(page.url().split('/').pop()),endpoint=`/api/projects/${project.id}/diagrams/${id}`;
  const saved=await(await request.get(endpoint)).json();expect(saved.revision).toBe(1);
  await openLayers(page);await page.getByRole('button',{name:'n3 · JAK',exact:true}).click();await page.getByRole('textbox',{name:'节点文字',exact:true}).fill('Edited protein');
  await page.getByRole('combobox',{name:'标签位置'}).selectOption('below');await page.getByText('标记与编号',{exact:true}).click();await page.getByRole('checkbox',{name:'磷酸化 P',exact:true}).check();
  await page.getByText('结构与连接',{exact:true}).click();await page.getByRole('combobox',{name:'风格预设'}).selectOption('soft-illustration');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('combobox',{name:'风格预设'})).toHaveValue('nature-flat');
  await page.getByRole('button',{name:'e6 · n7 → n3',exact:true}).click();await page.getByRole('combobox',{name:'走线方式'}).selectOption('orthogonal');
  await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/^已保存$/})).toBeVisible();
  const edited=await(await request.get(endpoint)).json();expect(edited.revision).toBe(2);expect(edited.doc.nodes.find((n:any)=>n.id==='n3').label).toBe('Edited protein');expect(edited.doc.edges.find((e:any)=>e.id==='e6').route).toBe('orthogonal');
  await page.screenshot({path:artifactPath(testInfo,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||"diagram-19-A-acceptance"}/diagram-editor.png`),fullPage:true});
  await request.put(endpoint,{data:{base_revision:2,doc:edited.doc}});await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'机制图已被更新，本机草稿仍保留'})).toBeVisible();
  await page.getByRole('button',{name:'重新载入最新版本'}).click();await page.getByRole('dialog').getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'版本历史',exact:true}).click();await page.getByRole('button',{name:'恢复第 1 版',exact:true}).click();await page.getByRole('dialog').filter({hasText:'将第 1 版恢复为新版本'}).getByRole('button',{name:'继续',exact:true}).click();
  await expect.poll(async()=>(await(await request.get(endpoint)).json()).revision).toBe(4);expect((await(await request.get(endpoint)).json()).doc).toEqual(saved.doc);
});

test('diagram drafts, keyboard movements and duplication stay local until explicit save',async({page,request})=>{
  const project=await(await request.post('/api/projects',{data:{name:`机制图草稿验收 ${Date.now()}`,description:'Synthetic fixture only'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Draft synthetic',template:'pipeline',style:'conference-framework'}})).json();expect(created.id).toBeTruthy();
  const endpoint=`/api/projects/${project.id}/diagrams/${created.id}`;
  await page.goto(`/projects/${project.id}/diagrams/${created.id}`);await openLayers(page);await page.getByRole('button',{name:'n1 · Video frames',exact:true}).click();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('spinbutton',{name:'X（mm）'})).toHaveValue('6');
  await page.keyboard.press('Shift+ArrowRight');await expect(page.getByRole('spinbutton',{name:'X（mm）'})).toHaveValue('11');
  await page.keyboard.press('Control+d');await expect(page.getByTestId('diagram-canvas').locator('[data-node-id]')).toHaveCount(created.doc.nodes.length+1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByTestId('diagram-canvas').locator('[data-node-id]')).toHaveCount(created.doc.nodes.length);
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),`figtide-diagram-draft-v1:${project.id}:${created.id}`)).not.toBeNull();
  await page.reload();await page.getByRole('button',{name:'恢复本机草稿'}).click();await openLayers(page);await page.getByRole('button',{name:'n1 · Video frames',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'X（mm）'})).toHaveValue('11');
  expect((await(await request.get(endpoint)).json()).revision).toBe(1);expect((await(await request.get(endpoint)).json()).doc).toEqual(created.doc);
});

test('zone dragging, connector dragging, box selection and layout are reversible edits',async({page,request})=>{
  const project=await(await request.post('/api/projects',{data:{name:`机制图拖动验收 ${Date.now()}`,description:'Synthetic interaction fixture only'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Pointer synthetic',template:'framework',style:'conference-framework'}})).json();
  await page.goto(`/projects/${project.id}/diagrams/${created.id}`);const canvas=page.getByTestId('diagram-canvas');await expect(canvas).toBeVisible();
  await expect.poll(async()=>Math.abs((await canvas.boundingBox())!.width-Math.max(720,(await page.locator('.diagram-stage').boundingBox())!.width*.9))).toBeLessThan(2);
  const rect=(await canvas.boundingBox())!,point=(x:number,y:number)=>({x:rect.x+x/180*rect.width,y:rect.y+y/110*rect.height});
  const start=point(60,45),end=point(64,48);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();
  await openLayers(page);await page.getByRole('button',{name:'n1 · Video frames',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'X（mm）'})).toHaveValue('9');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'X（mm）'})).toHaveValue('5');
  const handle=canvas.locator('[data-connect-node="n1"]');await expect(handle).toBeVisible();const a=(await handle.boundingBox())!,b=(await canvas.locator('[data-node-id="n3"]').boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();await expect(canvas.locator('[data-edge-id]')).toHaveCount(created.doc.edges.length+1);
  await page.keyboard.press('Escape');const tl=point(.3,.3),br=point(114,55);await page.mouse.move(tl.x,tl.y);await page.mouse.down();await page.mouse.move(br.x,br.y,{steps:5});await page.mouse.up();await expect(page.getByText('已选 6 项，下面修改第一项。')).toBeVisible();
  await page.getByText('结构与连接',{exact:true}).click();await page.getByRole('button',{name:'整理排版',exact:true}).click();await page.keyboard.press('Control+s');
  await expect.poll(async()=>(await(await request.get(`/api/projects/${project.id}/diagrams/${created.id}`)).json()).revision).toBe(2);
  const result=await(await request.get(`/api/projects/${project.id}/diagrams/${created.id}`)).json();expect(result.doc.edges).toHaveLength(created.doc.edges.length+1);
});

test('SVG, 300/600dpi PNG and embedded-Chinese PDF preserve finished dimensions without saving',async({page,request},testInfo)=>{
  const project=await(await request.post('/api/projects',{data:{name:`机制图导出验收 ${Date.now()}`,description:'Synthetic export fixture'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Synthetic diagram export',template:'pipeline',style:'nature-flat',label_language:'zh'}})).json();
  await page.goto(`/projects/${project.id}/diagrams/${created.id}`);await page.getByRole('button',{name:'导出机制图',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导出机制图'});
  async function download(name:string){const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载文件'}).click();const file=await pending,path=artifactPath(testInfo,`../.runtime/${name}`);await file.saveAs(path);return readFileSync(path);}
  const svg=await download('diagram.svg');const parsed=await page.evaluate(text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');return {error:!!doc.querySelector('parsererror'),width:doc.documentElement.getAttribute('width'),height:doc.documentElement.getAttribute('height'),glyphs:doc.querySelectorAll('[data-scientific-glyph]').length,images:doc.querySelectorAll('image').length};},svg.toString('utf8'));
  expect(parsed).toEqual({error:false,width:'180mm',height:'110mm',glyphs:6,images:0});
  await dialog.getByRole('combobox',{name:'机制图导出格式'}).selectOption('png');
  for(const [dpi,width,height,ppm] of [[300,2126,1299,11811],[600,4252,2598,23622]]){
    await dialog.getByRole('combobox',{name:'PNG分辨率'}).selectOption(String(dpi));const png=await download(`diagram-${dpi}.png`);expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(png.readUInt32BE(16)).toBe(width);expect(png.readUInt32BE(20)).toBe(height);
    let density=0;for(let i=8;i<png.length;){const size=png.readUInt32BE(i),kind=png.toString('ascii',i+4,i+8);if(kind==='pHYs'){density++;expect(png.readUInt32BE(i+8)).toBe(ppm);expect(png[i+16]).toBe(1);}i+=size+12;}expect(density).toBe(1);
  }
  await dialog.getByRole('combobox',{name:'机制图导出格式'}).selectOption('pdf');const pdf=(await download('diagram-zh.pdf')).toString('latin1');expect(pdf.startsWith('%PDF-')).toBe(true);expect(pdf).toContain('/FontFile2');expect(pdf).toContain('/ToUnicode');const dimensions=pdf.match(/\/MediaBox\s*\[([^\]]+)\]/)![1].trim().split(/\s+/).map(Number);expect(dimensions[2]).toBeCloseTo(180*72/25.4,1);expect(dimensions[3]).toBeCloseTo(110*72/25.4,1);
  expect((await(await request.get(`/api/projects/${project.id}/diagrams/${created.id}`)).json()).revision).toBe(1);
  const english=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Synthetic English export',template:'pipeline',style:'nature-flat'}})).json();
  await page.goto(`/projects/${project.id}/diagrams/${english.id}`);await page.getByRole('button',{name:'导出机制图',exact:true}).click();await dialog.getByRole('combobox',{name:'机制图导出格式'}).selectOption('pdf');
  const ascii=(await download('diagram-en.pdf')).toString('latin1');expect(ascii.startsWith('%PDF-')).toBe(true);expect(ascii).toContain('/BaseFont /Helvetica');expect(ascii).not.toContain('/FontFile2');
  for(const language of ['en','zh']){
    const mechanism=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Mechanism vector italic export',template:'mechanism',style:'nature-flat',label_language:language}})).json();
    await page.goto(`/projects/${project.id}/diagrams/${mechanism.id}`);await page.getByRole('button',{name:'导出机制图',exact:true}).click();await dialog.getByRole('combobox',{name:'机制图导出格式'}).selectOption('pdf');
    const file=await download(`mechanism-${language}.pdf`);expect(file.toString('latin1')).toContain('/MediaBox');
    expect(file.toString('latin1').includes('/FontFile2')).toBe(language==='zh');
    writeFileSync(artifactPath(testInfo,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||"diagram-19-A-acceptance"}/exports/mechanism-${language}.pdf`),file);
  }

});
