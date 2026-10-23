import {test,expect} from "@playwright/test";
import {defaults} from "../src/editor/model";
test("first visit redirects to /welcome, start pushes the workspace, and back returns to the intro",async({page})=>{
  await page.goto('/');await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator('.product-intro')).toBeVisible();await expect(page.locator('.masthead')).toHaveCount(0);
  await expect(page.locator('.product-intro header .cta')).toHaveText(/开始创作/);
  await page.getByRole('button',{name:'开始创作',exact:true}).first().click();
  await expect(page.locator('.home')).toBeVisible();await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(()=>localStorage.getItem('labflow-intro-seen'))).toBe('1');
  await page.goBack();await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator('.product-intro')).toBeVisible();
  await expect(page.locator('.product-intro header .cta')).toHaveText(/进入工作区/);
  await page.goForward();await expect(page.locator('.home')).toBeVisible();
  await page.reload();await expect(page.locator('.home')).toBeVisible();
  await page.getByRole('link',{name:'关于 LabFlow'}).click();await expect(page.locator('.product-intro')).toBeVisible();
});
test("the home sidebar keeps a product intro entry",async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('labflow-intro-seen','1'));
  await page.goto('/');await expect(page.locator('.home')).toBeVisible();
  const entry=page.getByRole('link',{name:'产品介绍'});
  await expect(entry).toBeVisible();
  await entry.click();await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator('.product-intro')).toBeVisible();
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