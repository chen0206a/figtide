import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';

test('capture current diagram pages for visual acceptance',async({page,request},testInfo)=>{
  test.skip(process.env.LABFLOW_CAPTURE!=='1','Explicit screenshot capture only');
  await page.setViewportSize({width:1920,height:1080});
  const project=await(await request.post('/api/projects',{data:{name:'任务19新版界面验收',description:'Isolated synthetic screenshot fixtures; no user data or model calls.'}})).json();
  async function shot(name:string){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:artifactPath(testInfo,`../docs/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE?"test-evidence/"+process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE:"screenshots/task19-latest"}/${name}.png`),fullPage:false});}
  await page.goto(`/projects/${project.id}/diagrams`);
  await expect(page.getByRole('button',{name:'新建机制图',exact:true})).toBeVisible();
  await shot('01-diagram-list');
  await page.getByRole('button',{name:'新建机制图',exact:true}).click();
  const wizard=page.getByRole('region',{name:'新建机制图'});
  await expect(wizard.getByRole('button',{name:'分区机制',exact:true})).toBeVisible();
  await shot('02-new-templates');
  await wizard.getByRole('button',{name:'分区机制',exact:true}).click();
  await wizard.getByRole('button',{name:'Nature 扁平',exact:true}).click();
  await shot('03-new-mechanism-preview');

  await wizard.getByRole('textbox',{name:'机制图名称'}).fill('信号通路机制图 · 界面验收');
  await shot('04-new-size');
  await wizard.getByRole('button',{name:'创建机制图',exact:true}).click();
  await expect(page.getByRole('main',{name:'机制图编辑器'})).toBeVisible();
  await expect(page.getByTestId('diagram-canvas').locator('[data-scientific-glyph="receptor"]')).toHaveCount(1);
  await shot('05-mechanism-editor');
  await page.locator('.diagram-layers summary').click();
  await page.getByRole('button',{name:'n3 · JAK',exact:true}).click();
  await shot('06-node-properties');
  await page.getByRole('button',{name:'导出机制图',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'导出机制图'})).toBeVisible();
  await shot('07-export-dialog');
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'方法框架 · 界面验收',template:'framework',style:'conference-framework',label_language:'zh'}})).json();
  expect(created.id).toBeTruthy();
  await page.goto(`/projects/${project.id}/diagrams/${created.id}`);
  await expect(page.getByRole('main',{name:'机制图编辑器'})).toBeVisible();
  await expect(page.getByTestId('diagram-canvas').locator('[data-node-id]').first()).toBeVisible();
  await shot('08-framework-editor');
  await page.getByRole('button',{name:'版本历史',exact:true}).click();
  await expect(page.getByRole('button',{name:'恢复第 1 版',exact:true})).toBeVisible();
  await shot('09-version-history');
});
