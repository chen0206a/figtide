const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
const outputRoot = '.runtime/refactor09-comparisons';
const fs = require('fs');
const { chromium } = require('../frontend/node_modules/@playwright/test');
fs.mkdirSync(outputRoot, { recursive: true });
const pairs = [
  ['experiments', 'Experiments.png', 'refactor-09-final-experiments.png'],
  ['data', 'Data.png', 'refactor-09-final-data.png'],
  ['editor-single', 'Editor.png', 'refactor-09-editor-single.png'],
  ['editor-double', 'Editor-double.png', 'refactor-09-editor-double.png'],
];
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:2880,height:1100},deviceScaleFactor:1});
    const images=[];
    for(const [name,reference,actual] of pairs){
      const ref='refactor/design/09-10/png/'+reference;
      const file='docs/screenshots/'+actual;
      const width=fs.readFileSync(file).readUInt32BE(16);
      if(width!==1440)throw Error(file+' width '+width);
      const src=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
      await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:white;font:18px Arial;color:#222}main{display:flex;align-items:flex-start}figure{margin:0;width:1440px}figcaption{padding:16px 24px;border-bottom:1px solid #ddd}img{display:block;width:1440px;height:auto}</style><main><figure><figcaption>设计稿 · '+reference+'</figcaption><img src="'+src(ref)+'"></figure><figure><figcaption>任务09历史页面 · '+name+'</figcaption><img src="'+src(file)+'"></figure></main>');
      await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
      const output=outputRoot+'/refactor-09-compare-'+name+'.png';
      await page.screenshot({path:output,fullPage:true,animations:'disabled'});
      images.push({name,reference:ref,actual:file,comparison:output,actual_width:width});
    }
    fs.writeFileSync(outputRoot+'/comparisons.json',JSON.stringify(images,null,2)+'\n');
    console.log(JSON.stringify(images));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
