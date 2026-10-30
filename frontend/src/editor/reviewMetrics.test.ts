import {expect,it} from 'vitest';
import fixtures from './review-metrics-v1.json';
import {publicationMetrics} from './publication';
import type {Config} from './model';
it('matches the same physical-unit fixtures exercised by Java review rules',()=>{
  for(const f of fixtures){
    const config={style:{width:f.canvas,height:500},publication:{enabled:true,widthMm:f.width,fontPt:f.font,dpi:300}} as Config;
    expect(publicationMetrics(config).fontPx).toBeCloseTo(f.pixels,9);
    expect(publicationMetrics(config).fontPx*f.width/f.canvas*72/25.4).toBeCloseTo(f.font,9);
  }
});
