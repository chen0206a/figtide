import {expect,it} from 'vitest';
import {markerTarget,measureMarkers} from './proposalMarkers';
it('maps paths to ordered legend, series, axis and title targets',()=>{
 expect(markerTarget('/legend/position',2)).toEqual({kind:'legend'});
 expect(markerTarget('/series/1/color',2)).toEqual({kind:'series',index:1});
 expect(markerTarget('/axes/x/grid',2)).toEqual({kind:'axis',axis:'x'});
 expect(markerTarget('/axes/y/min',2)).toEqual({kind:'axis',axis:'y'});
 expect(markerTarget('/title',2)).toEqual({kind:'title'});
 expect(markerTarget('/style/title',2)).toEqual({kind:'title'});
});
it('does not invent positions for unsupported, malformed or absent series',()=>{
 for(const path of ['/series','/series/-1/color','/series/5/color','/axes/z/grid','legend/position','/series/0~1fake/color'])expect(markerTarget(path,2)).toBeNull();
});
const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top});
function graph({title=true,line=true}={}){
 const titleNode={getBoundingClientRect:()=>rect(100,60,200,30)};
 const lineNode=Object.assign({
  getTotalLength:()=>400,
  getPointAtLength:(length:number)=>({x:length,y:length/2}),
  getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
  getAttribute:()=> 'M0 0L400 100',
  getBoundingClientRect:()=>rect(100,100,300,200),
 },{});
 const lines=[lineNode];
 const trace={classList:{contains:(name:string)=>name==='traceabc'},querySelectorAll:()=>lines};
 return {
  getBoundingClientRect:()=>rect(0,0,760,500),
  querySelectorAll:(selector:string)=>{
   if(selector==='.gtitle')return title?[titleNode]:[];
   if(selector==='.scatterlayer .trace')return title||line?[trace]:[trace];
   return [];
  },
  querySelector:(selector:string)=>selector==='.gtitle'&&title?titleNode:null,
  _fullData:[{uid:'abc',customdata:['s1']}],
 } as unknown as HTMLDivElement;
}
const preview=(changes:{path:string}[])=>({config:{style:{width:760,height:500},series:[{id:'s1'}]},changes} as never);
it('marks a series at the midpoint of its line instead of boxing the whole curve',()=>{
 const markers=measureMarkers(graph(),preview([{path:'/series/0/width'}]));
 expect(markers).toHaveLength(1);
 expect(markers[0]).toMatchObject({kind:'series',number:1,width:0,height:0});
 expect(markers[0].x).toBeCloseTo(200);
 expect(markers[0].y).toBeCloseTo(100);
 expect(markers[0].paths).toHaveLength(1);
});
it('boxes the title text when only the title changes',()=>{
 const markers=measureMarkers(graph(),preview([{path:'/style/title'}]));
 expect(markers).toHaveLength(1);
 expect(markers[0]).toMatchObject({kind:'title',x:100,y:60,width:200,height:30});
});
it('draws nothing when the target is not on the canvas',()=>{
 expect(measureMarkers(graph({title:false,line:false}),preview([{path:'/style/title'}]))).toEqual([]);
});