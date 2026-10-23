import {expect,it} from 'vitest';
import {markerTarget} from './proposalMarkers';
it('maps paths to ordered legend, series and axis targets',()=>{
 expect(markerTarget('/legend/position',2)).toEqual({kind:'legend'});
 expect(markerTarget('/series/1/color',2)).toEqual({kind:'series',index:1});
 expect(markerTarget('/axes/x/grid',2)).toEqual({kind:'axis',axis:'x'});
 expect(markerTarget('/axes/y/min',2)).toEqual({kind:'axis',axis:'y'});
});
it('does not invent positions for unsupported, malformed or absent series',()=>{
 for(const path of ['/style/title','/series','/series/-1/color','/series/5/color','/axes/z/grid','legend/position','/series/0~1fake/color'])expect(markerTarget(path,2)).toBeNull();
});
