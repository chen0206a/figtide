import {test,expect} from "@playwright/test";
import {defaults} from "../src/editor/model";
test("first visit → workspace → refresh → welcome is always available",async({page})=>{
  await page.goto('/');await expect(page.locator('.product-intro')).toBeVisible();await expect(page.locator('.masthead')).toHaveCount(0);
  await page.getByRole('button',{name:'开始创作',exact:true}).first().click();await expect(page.locator('.home')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('labflow-intro-seen'))).toBe('1');
  await page.reload();await expect(page.locator('.home')).toBeVisible();
  await page.getByRole('link',{name:'关于 LabFlow'}).click();await expect(page.locator('.product-intro')).toBeVisible();
});
test("an unseen-intro deep link opens the exact real saved figure",async({page,request})=>{
  const p=await(await request.post('/api/projects',{data:{name:'介绍页深链接 · 合成演示',description:'Task10'}})).json();
  const d=await(await request.post(`/api/projects/${p.id}/datasets`,{multipart:{file:{name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('epoch,accuracy\n1,0.7\n2,0.9')}}})).json();
  const c=await(await request.post(`/api/projects/${p.id}/charts`,{data:{name:'深链接图',config:defaults(d)}})).json();
  await page.goto(`/projects/${p.id}/figures/${c.id}`);await expect(page.getByTestId('plot').locator('.main-svg').first()).toBeVisible();await expect(page.locator('.product-intro')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('labflow-intro-seen'))).toBeNull();
});
test("blocked intro storage falls back to the workspace",async({page})=>{
  await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='labflow-intro-seen')throw new Error('blocked');return original.call(this,key)}});
  await page.goto('/');await expect(page.locator('.home')).toBeVisible();await expect(page.locator('.product-intro')).toHaveCount(0);
});
