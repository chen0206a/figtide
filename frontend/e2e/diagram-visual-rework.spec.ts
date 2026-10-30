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
test('capture flagship templates at reference viewport',async({page,request},info)=>{
  const project=await(await request.post('/api/projects',{data:{name:'Flagship visual comparison',description:'Synthetic visual fixtures only'}})).json();
  await page.setViewportSize({width:1440,height:960});
  for(const [template,style] of [['mechanism','nature-flat'],['framework','conference-framework']]){
    const diagram=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:template==='mechanism'?'JAK–STAT 信号通路':'视频问答方法总览',template,style}})).json();
    expect(diagram.id).toBeTruthy();await page.goto(`/projects/${project.id}/diagrams/${diagram.id}`);
    await expect(page.getByTestId('diagram-canvas')).toBeVisible();
    await expect.poll(async()=>Math.abs((await page.getByTestId('diagram-canvas').boundingBox())!.width-Math.max(720,(await page.locator('.diagram-stage').boundingBox())!.width*.9))).toBeLessThan(2);
    await page.screenshot({path:artifactPath(info,`../docs/test-evidence/diagram-checkpoint-b/${template}-1440.png`)});
  }
});
