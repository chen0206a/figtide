import {expect,it,vi} from 'vitest';
import {extractPalette,extractSvgStyle} from './extractStyle';
it('uses deterministic weighted k-means and excludes the border background and transparency',()=>{
  const pixels=new Uint8ClampedArray(6*6*4);for(let i=0;i<36;i++)pixels.set([255,255,255,255],i*4);pixels.set([0,114,178,255],(2*6+2)*4);pixels.set([0,158,115,255],(2*6+3)*4);pixels.set([255,0,0,0],(3*6+3)*4);
  const result=extractPalette(pixels,6,6);expect(result).toContain('#0072B2');expect(result).toContain('#009E73');expect(result).not.toContain('#FFFFFF');expect(result).not.toContain('#FF0000');expect(extractPalette(pixels,6,6)).toEqual(result);expect(result.length).toBeLessThanOrEqual(6);
});
it('extracts physical SVG line width, radius and supported font without storing artwork',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="110mm" viewBox="0 0 180 110"><rect x="10" y="10" width="70" height="30" rx="2" fill="#0072B2" stroke="#009E73" stroke-width="1pt"/><text x="10" y="70" font-family="Inter">Private source</text></svg>';
  const result=extractSvgStyle(svg);expect(result.colors).toEqual(['#0072B2','#009E73']);expect(result.overrides.line_width_pt).toBe(1);expect(result.overrides.radius_mm).toBeCloseTo(2,3);expect(result.overrides.font_family).toBe('Inter, Arial, sans-serif');expect(JSON.stringify(result)).not.toContain('Private source');expect(JSON.stringify(result)).not.toContain('<svg');
});
it('rejects XML entities and never fetches a reference URL while reading SVG appearance',()=>{
  expect(()=>extractSvgStyle('<!DOCTYPE svg [<!ENTITY x SYSTEM "https://evil.invalid">]><svg/>')).toThrow();const fetch=vi.spyOn(globalThis,'fetch');extractSvgStyle('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/photo.png"/><rect width="10" height="10" fill="#123456"/></svg>');expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
