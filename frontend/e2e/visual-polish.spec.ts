import { test, expect } from "@playwright/test";
import { defaults } from "../src/editor/model";

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
test("polish surfaces use neutral metadata and preserve saved source", async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { name: '视觉打磨验收 · 合成演示', description: 'Task 09 synthetic fixture' } })).json();
  const data = await (await request.post(`/api/projects/${project.id}/datasets`, { multipart: { file: {
    name: 'synthetic-learning-dynamics.csv', mimeType: 'text/csv', buffer: Buffer.from('epoch,accuracy,loss\n1,0.71,0.8\n2,0.82,\n3,0.91,0.2')
  } } })).json();
  const config = defaults(data);
  config.style.title = 'Learning dynamics · synthetic';
  const chart = await (await request.post(`/api/projects/${project.id}/charts`, { data: { name: '训练曲线 · 合成演示', config } })).json();
  for (let i=0; i<3; i++) {
    expect((await request.post(`/api/projects/${project.id}/experiments`, { data: {
      name: ['AdamW baseline', 'Cosine schedule', 'Augmented training'][i], status: ['completed','running','planned'][i],
      parameters: { lr: 0.001, batch_size: 64, seed: i+1 }, metrics: { accuracy: 0.87+i*0.02, loss: 0.3-i*0.04 },
      notes: '合成演示数据，用于界面验收。', tags: ['synthetic'], dataset_version_ids: [data.id]
    } })).ok()).toBe(true);
  }
  await page.addInitScript(id => localStorage.setItem('labflow-project',String(id)), project.id);
  const stage = process.env.LABFLOW_POLISH_STAGE || 'final';
  for (const surface of [
    { name:'home', url:'/', ready:'.home-intro', meta:'.home-meta' },
    { name:'experiments', url:`/projects/${project.id}/experiments`, ready:'.experiment-filters', meta:'.experiment-filters > span' },
    { name:'data', url:`/projects/${project.id}/data`, ready:'.data-title h2', meta:'.dataset-list small' },
    { name:'editor', url:`/projects/${project.id}/figures/${chart.id}`, ready:'[data-testid="plot"] .main-svg', meta:'.dataset-meta' }
  ]) {
    await page.goto(surface.url);
    await expect(page.locator(surface.ready).first()).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator(surface.meta).first()).toHaveCSS('color','rgb(95, 103, 115)');
    if (surface.name === 'home') {
      const projectHead = page.locator('.home-project-table th').first();
      const experimentHead = page.locator('.home-table th').first();
      await expect(projectHead).toHaveCSS('background-color','rgb(248, 249, 251)');
      await expect(experimentHead).toHaveCSS('background-color','rgb(248, 249, 251)');
      await expect(experimentHead).toHaveCSS('text-transform','none');
    }
    if (surface.name === 'data') {
      await expect(page.getByLabel('空值')).toHaveText('空');
      await expect(page.getByText('0.71',{exact:true})).toHaveClass(/\bnum\b/);
      const widths = await page.locator('.table-scroll').evaluate(el=>({viewport:el.clientWidth,table:el.querySelector('table')!.getBoundingClientRect().width}));
      expect(widths.table).toBeGreaterThanOrEqual(widths.viewport-1);
    }
    await page.screenshot({path:`../docs/screenshots/refactor-09-${stage}-${surface.name}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);
  }
  const saved = await (await request.get(`/api/projects/${project.id}/charts/${chart.id}`)).json();
  expect(saved.config).toEqual(config);
  expect(saved.revision).toBe(1);
});
