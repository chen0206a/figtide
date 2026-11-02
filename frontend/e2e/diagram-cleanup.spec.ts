import {test,expect} from './workspace-test';
import {artifactPath} from './artifacts';
import {writeFileSync} from 'node:fs';
test('19-A-7 scientific examples, outline warnings and unobstructed creation bar',async({page,request},info)=>{
  const catalog=await(await request.get('/api/diagram-catalog')).json();
  expect(catalog.templates).toHaveLength(20);
  for(const t of catalog.templates)for(const lang of ['en','zh'])for(const n of t.documents[lang].nodes)expect(n.label).not.toMatch(/^(Input|Output|Stage [AB]|Part \d|Concept|Branch [AB])$/);
  const project=await(await request.post('/api/projects',{data:{name:'19A7 synthetic',description:'Isolated scientific examples'}})).json();
  expect(project.id).toBeTruthy();
  await page.setViewportSize({width:1440,height:960});await page.goto(`/projects/${project.id}/diagrams`);
  await page.getByRole('button',{name:'从分区机制开始',exact:true}).click();
  const wizard=page.getByRole('region',{name:'新建机制图'}),button=wizard.getByRole('button',{name:'创建机制图',exact:true});
  await expect(button).toBeInViewport();
  expect(await page.locator('.diagram-template-browser .diagram-thumbnail-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
  const crops=await page.locator('.diagram-style-choice svg').evaluateAll(els=>els.map(el=>el.getAttribute('viewBox')));expect(new Set(crops)).toEqual(new Set(['18 8 34 40']));
  const panel=page.getByRole('complementary',{name:'机制图创建预览'});
  for(const control of [wizard.getByRole('textbox',{name:'机制图名称'}),...catalog.styles.map((s:{name:string})=>wizard.getByRole('button',{name:s.name,exact:true})),wizard.getByRole('group',{name:'机制图配色'}),wizard.getByRole('combobox',{name:'成品规格'}),wizard.getByRole('spinbutton',{name:'成品高度'}),button])await expect(control).toBeInViewport();
  const styles=await page.locator('.diagram-style-choice').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));expect(styles).toHaveLength(6);expect(Math.max(...styles)-Math.min(...styles)).toBeLessThan(1);
  const chips=await page.locator('.diagram-palette-chips button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));expect(chips).toHaveLength(6);expect(Math.max(...chips)-Math.min(...chips)).toBeLessThan(1);
  expect((await page.locator('.diagram-large-preview').boundingBox())!.height).toBeCloseTo(260,0);
  expect(await page.locator('.diagram-wizard-preview-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  expect((await panel.boundingBox())!.y+(await panel.boundingBox())!.height).toBeLessThanOrEqual(960);
  const bar=await page.locator('.diagram-create-actions').boundingBox(),fields=await page.locator('.diagram-wizard-preview-scroll').boundingBox();expect(fields!.y+fields!.height).toBeLessThanOrEqual(bar!.y+1);
  await expect(page.locator('.diagram-palette-audit')).toHaveCount(0);await expect(wizard.getByRole('status')).toContainText('低于 ΔE 10');
  const doc=catalog.templates.find((t:{id:string})=>t.id==='mechanism').documents.en,roles=new Set(doc.nodes.filter((n:{kind:string;glyph:string})=>n.kind!=='text'&&!['phospho','number','frozen','trainable'].includes(n.glyph)).map((n:{style_ref:string;role:string})=>n.style_ref||n.role));
  const audit=catalog.palette_audits.find((a:{id:string;preset:string})=>a.id==='okabe-ito'&&a.preset==='nature-flat');audit.failing_pairs=audit.failing_pairs.filter((p:{roles:string[]})=>p.roles.every(r=>roles.has(r)));audit.used_roles=[...roles];audit.template='mechanism';
  if(process.env.LABFLOW_CAPTURE==='1'){
    const folder=`../docs/test-evidence/${process.env.LABFLOW_DIAGRAM_CAPTURE_PHASE||'diagram-19-A-7'}`;
    writeFileSync(artifactPath(info,`${folder}/okabe-ito-audit.json`),JSON.stringify(audit,null,2));
    await page.screenshot({path:artifactPath(info,`${folder}/new-page-1440.png`),fullPage:false});
    
    await page.screenshot({path:artifactPath(info,`${folder}/new-page-color-audit-1440.png`),fullPage:false});
    
    await wizard.getByRole('combobox',{name:'成品规格'}).selectOption('custom');
    await expect(wizard.getByRole('spinbutton',{name:'成品宽度'})).toBeInViewport();await expect(wizard.getByRole('spinbutton',{name:'成品高度'})).toBeInViewport();await expect(button).toBeInViewport();
    await page.screenshot({path:artifactPath(info,`${folder}/new-page-custom-1440.png`),fullPage:false});
    await wizard.getByRole('combobox',{name:'成品规格'}).selectOption('double');
  }
  await button.click();await expect(page.getByTestId('diagram-canvas')).toBeVisible();
});
