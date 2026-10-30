import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';
test('diagram initially fits width, manual zoom and fit button reflect actual scale',async({page,request},info)=>{
  const project=await(await request.post('/api/projects',{data:{name:'Visual rework synthetic fixture',description:'Synthetic isolated visual acceptance'}})).json();
  const diagram=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'Visual rework',template:'mechanism',style:'nature-flat'}})).json();
  expect(project.id).toBeTruthy();expect(diagram.id).toBeTruthy();
  await page.setViewportSize({width:1440,height:960});
  await page.goto(`/projects/${project.id}/diagrams/${diagram.id}`);
  const canvas=page.getByTestId('diagram-canvas'),stage=page.locator('.diagram-stage'),toolbar=page.locator('.diagram-stage-toolbar');
  await expect(canvas).toBeVisible();
  async function fit(){await expect.poll(async()=>{const a=(await canvas.boundingBox())!,b=(await stage.boundingBox())!;return Math.abs(a.width-Math.max(720,b.width*.9));}).toBeLessThan(2);}
  await fit();
  await expect(toolbar.getByText(/^\d+%$/)).toHaveCount(1);
  await page.getByRole('button',{name:'放大机制图',exact:true}).click();
  const width=(await canvas.boundingBox())!.width;
  await page.getByRole('button',{name:'适应宽度',exact:true}).click();await fit();
  expect((await canvas.boundingBox())!.width).toBeLessThan(width);
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-step1/fit-1440.png'),fullPage:true});
  await page.setViewportSize({width:1920,height:1080});await fit();
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-step1/fit-1920.png'),fullPage:true});
});
test('capture final creation page, export preview and actual interaction frames',async({page,request},info)=>{
  test.skip(process.env.LABFLOW_CAPTURE!=='1','Explicit visual capture');
  const project=await(await request.post('/api/projects',{data:{name:'Checkpoint C synthetic',description:'Synthetic interaction capture; no models'}})).json();
  await page.setViewportSize({width:1440,height:960});
  await page.goto(`/projects/${project.id}/diagrams`);
  await page.getByRole('button',{name:'新建机制图',exact:true}).click();
  const wizard=page.getByRole('region',{name:'新建机制图'});
  await expect(wizard.getByRole('textbox',{name:'机制图名称'})).toBeInViewport();
  await expect(wizard.getByRole('button',{name:'创建机制图',exact:true})).toBeInViewport();
  await expect(page.locator('.diagram-large-preview')).toBeVisible();
  expect((await page.locator('.diagram-large-preview').boundingBox())!.width).toBeGreaterThanOrEqual(500);
  await wizard.getByRole('button',{name:'分区机制',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect(wizard.getByRole('heading',{name:'新建机制图',exact:true})).toBeInViewport();
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-checkpoint-c/new-page.png'),fullPage:true});
  await wizard.getByRole('textbox',{name:'机制图名称'}).fill('JAK–STAT 操作验收');
  await wizard.getByRole('button',{name:'创建机制图',exact:true}).click();
  const canvas=page.getByTestId('diagram-canvas');await expect(canvas).toBeVisible();
  const id=page.url().split('/').pop(),endpoint=`/api/projects/${project.id}/diagrams/${id}`;
  await expect.poll(async()=>Math.abs((await canvas.boundingBox())!.width-Math.max(720,(await page.locator('.diagram-stage').boundingBox())!.width*.9))).toBeLessThan(2);
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-checkpoint-c/mechanism-1440.png'),fullPage:true});
  const original=(await(await request.get(endpoint)).json()).doc;
  // Direct click adds at canvas centre; undo is a single reversible edit.
  await page.getByRole('button',{name:'插入蛋白',exact:true}).click();
  await expect(canvas.locator('[data-node-id]')).toHaveCount(original.nodes.length+1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(canvas.locator('[data-node-id]')).toHaveCount(original.nodes.length);
  // A real browser drag gesture exercises dragstart, dragover and drop.
  const rect=(await canvas.boundingBox())!;
  await page.getByRole('button',{name:'插入蛋白',exact:true}).dragTo(canvas,{targetPosition:{x:rect.width*.5,y:rect.height*.5}});
  await expect(canvas.locator('[data-node-id]')).toHaveCount(original.nodes.length+1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  let frame=0;
  async function capture(){await page.screenshot({path:artifactPath(info,`../docs/test-evidence/diagram-checkpoint-c/gif-frames/${String(frame++).padStart(3,'0')}.png`)});}
  await capture();
  const node=canvas.locator('[data-node-id="n3"]'),box=(await node.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  for(let i=1;i<=6;i++){await page.mouse.move(box.x+box.width/2+i*3,box.y+box.height/2+i);await capture();}
  await page.mouse.up();await capture();
  const handle=(await canvas.locator('[data-connect-node="n3"]').boundingBox())!,target=(await canvas.locator('[data-node-id="n5"]').boundingBox())!;
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  for(let i=1;i<=5;i++){await page.mouse.move(handle.x+(target.x+target.width/2-handle.x)*i/5,handle.y+(target.y+target.height/2-handle.y)*i/5);await capture();}
  await expect(canvas.locator('[data-connection-preview]')).toHaveCount(1);await page.mouse.up();await expect(canvas.locator('[data-connection-preview]')).toHaveCount(0);await expect(canvas.locator('[data-edge-id]')).toHaveCount(original.edges.length+1);await capture();
  await page.getByRole('button',{name:'选择风格 柔和插画',exact:true}).click();await capture();await capture();
  await page.getByRole('combobox',{name:'机制图配色',exact:true}).selectOption('npg');await capture();await capture();
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('combobox',{name:'机制图配色',exact:true})).toHaveValue('okabe-ito');await capture();
  await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect.poll(async()=>(await(await request.get(endpoint)).json()).revision).toBe(2);await capture();await capture();
  await page.getByRole('button',{name:'导出机制图',exact:true}).click();await expect(page.getByRole('dialog',{name:'导出机制图'}).getByLabel('导出预览')).toBeVisible();
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-checkpoint-c/export-dialog.png'),fullPage:true});
  const framework=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'视频问答方法总览',template:'framework',style:'conference-framework'}})).json();
  await page.goto(`/projects/${project.id}/diagrams/${framework.id}`);await expect(canvas).toBeVisible();
  expect(await page.locator('.diagram-glyph-grid button span').evaluateAll(labels=>labels.every(label=>label.scrollWidth<=label.clientWidth+1))).toBe(true);
  await page.screenshot({path:artifactPath(info,'../docs/test-evidence/diagram-checkpoint-c/framework-1440.png'),fullPage:true});
});
test('capture flagship templates at reference viewport',async({page,request},info)=>{
  const project=await(await request.post('/api/projects',{data:{name:'Flagship visual comparison',description:'Synthetic visual fixtures only'}})).json();
  await page.setViewportSize({width:1440,height:960});
  for(const [template,style] of [['mechanism','nature-flat'],['framework','conference-framework']]){
    const diagram=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:template==='mechanism'?'JAK–STAT 信号通路':'视频问答方法总览',template,style}})).json();
    expect(diagram.id).toBeTruthy();await page.goto(`/projects/${project.id}/diagrams/${diagram.id}`);
    await expect(page.getByTestId('diagram-canvas')).toBeVisible();
    await expect.poll(async()=>Math.abs((await page.getByTestId('diagram-canvas').boundingBox())!.width-Math.max(720,(await page.locator('.diagram-stage').boundingBox())!.width*.9))).toBeLessThan(2);
    await page.screenshot({path:artifactPath(info,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||"diagram-checkpoint-b"}/${template}-1440.png`)});
  }
});
