import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';

test('skill → attributed facts → user edit → semantic proposal → deselect fix → apply → undo → refine',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json();
  const project=await(await request.post('/api/projects',{data:{name:'Diagram AI protocol',description:'Hand authored synthetic protocol; no real model'}})).json();
  const created=await(await request.post(`/api/projects/${project.id}/diagrams`,{data:{name:'RNA workflow protocol',template:'workflow',style:'nature-flat',label_language:'en'}})).json();
  const endpoint=`/api/projects/${project.id}/diagrams/${created.id}`;
  await page.setViewportSize({width:1440,height:960});await page.goto(`/projects/${project.id}/diagrams/${created.id}`);
  await page.getByRole('button',{name:'绘图助手',exact:true}).click();const panel=page.getByRole('region',{name:'机制图绘图助手'});
  await panel.getByLabel('绘图方案',{exact:true}).selectOption('workflow');expect(catalog.skills).toHaveLength(6);
  await panel.getByLabel('机制图绘图需求').fill('RNA enters a library.');await expect(panel.getByRole('button',{name:'生成简报与事实',exact:true})).toBeDisabled();
  await panel.getByRole('checkbox',{name:'同意将当前文档和描述发送至已配置的模型服务'}).check();
  async function screenshot(name:string){if(process.env.LABFLOW_CAPTURE==='1')await page.screenshot({path:artifactPath(info,`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||"diagram-19-B"}/agent-${name}.png`),fullPage:false});}
  await screenshot('skill-selection');await panel.getByRole('button',{name:'生成简报与事实',exact:true}).click();
  await expect(panel.getByLabel('事实 1',{exact:true})).toBeVisible();await panel.getByLabel('事实 1',{exact:true}).fill('RNA enters a library. Confirmed by user.');await panel.getByRole('button',{name:'删除事实 2',exact:true}).click();await screenshot('facts');
  expect((await(await request.get(endpoint)).json()).revision).toBe(1);
  await panel.getByRole('button',{name:'确认事实，生成结构提案',exact:true}).click();
  await expect(panel.getByRole('checkbox',{name:'修复 成品文字字号太小',exact:true})).toBeChecked({timeout:30000});
  const lineFix=panel.locator('article').filter({hasText:'成品线宽太细'});await lineFix.getByRole('button',{name:'忽略',exact:true}).click();await expect(lineFix.getByRole('checkbox')).toBeDisabled();await lineFix.getByRole('button',{name:'恢复',exact:true}).click();
  await panel.getByRole('checkbox',{name:'修复 成品文字字号太小',exact:true}).uncheck();
  await expect(page.locator('.diagram-agent-markers .proposal-marker-box').first()).not.toHaveCSS('fill','rgb(0, 0, 0)');
  await expect(page.locator('.diagram-agent-markers text').first()).toHaveCSS('fill','rgb(255, 255, 255)');
  await screenshot('structure-proposal');
  await panel.getByRole('button',{name:'预览这组调整',exact:true}).click();await expect(panel.getByRole('button',{name:'应用这组调整',exact:true})).toBeEnabled();
  await expect(panel.getByRole('button',{name:'应用这组调整',exact:true})).toBeInViewport();await screenshot('structure-apply');await panel.getByRole('button',{name:'应用这组调整',exact:true}).click();
  await expect(page.locator('[data-node-id="n1"] text').first()).toContainText('RNA');expect((await(await request.get(endpoint)).json()).revision).toBe(1);
  await screenshot('applied');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-node-id="n1"] text').first()).not.toContainText('RNA');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('[data-node-id="n1"] text').first()).toContainText('RNA');
  await page.getByRole('button',{name:'保存机制图',exact:true}).click();await expect.poll(async()=>(await(await request.get(endpoint)).json()).revision).toBe(2);
  const saved=(await(await request.get(endpoint)).json()).doc;expect(saved.style.overrides.font_size_pt).toBe(3);expect(saved.style.overrides.line_width_pt).toBeGreaterThan(.2);
  await panel.getByLabel('机制图绘图需求').fill('Change RNA to Library.');await panel.getByRole('button',{name:'生成简报与事实',exact:true}).click();await expect(panel.getByLabel('事实 1',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'确认事实，生成结构提案',exact:true}).click();await expect(panel.getByRole('button',{name:'预览这组调整',exact:true})).toBeVisible({timeout:30000});
  await panel.getByRole('button',{name:'预览这组调整',exact:true}).click();await expect(panel.getByRole('button',{name:'应用这组调整',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'应用这组调整',exact:true}).click();
  await expect(page.locator('[data-node-id="n1"] text').first()).toContainText('Library');expect((await(await request.get(endpoint)).json()).revision).toBe(2);await screenshot('refinement');
});
