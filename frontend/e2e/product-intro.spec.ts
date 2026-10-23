import {test,expect} from '@playwright/test';
test('product intro shows six diagrams, real destinations and no overflow at 1440 and 390',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto('/welcome');await expect(page.locator('.product-intro h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
    await expect(page.getByText('示意数据',{exact:true})).toHaveCount(2);await expect(page.locator('#charts figure')).toHaveCount(6);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await page.screenshot({path:`../docs/screenshots/refactor-10-intro-${width}.png`,fullPage:true,animations:'disabled'});
  }
  expect(errors).toEqual([]);
  await page.locator('[data-start]').last().click();await expect(page.locator('.home')).toBeVisible();
});
