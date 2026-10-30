import {expect,it,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AgentAssistant} from './AgentAssistant';
import {defaults,type Config} from './model';
import type {Dataset} from '../lib/api';
vi.mock('./StylePreview',()=>({StylePreview:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
it('shows three groups, recomputes selected repairs and confirms precisely the previewed configuration',async()=>{
  const data:Dataset={id:1,dataset_id:1,version:1,filename:'synthetic.csv',sha256:'abc',row_count:2,fields:[{name:'x',type:'number',missing:0},{name:'y',type:'number',missing:0}],rows:[{x:1,y:2},{x:2,y:3}],warnings:[]};
  const config=defaults(data);config.legend.show=true;config.style.fontSize=8;config.series[0].width=.5;
  const proposed=structuredClone(config);proposed.legend.position='right';
  const run={run_id:'synthetic-review',status:'proposed',outcome:'pending',persisted:true,proposal_hash:'hash',model:'fixture',steps:2,max_steps:6,tokens:10,latency_ms:1,text:'请确认',reason:'',catalog_hash:'hash',prompt_version:'v6',trace:[],proposal:{protocol_version:1,config:proposed,source:{dataset_version_id:1,sha256:'abc'},base_revision:1,operation_count:1,operations:[{tool:'set_legend',arguments:{position:'right'}}],changes:[{path:'/legend/position',before:'top',after:'right'}]}};
  const issue=(id:string,tool:string,args:object)=>({id,rule:id.split(':')[0],severity:'warning',title:id==='R1:font'?'字号太小':'线条太细',detail:'synthetic review',fixable:true,fix:[{tool,arguments:args}],anchor:{kind:'axis',ref:'y'}});
  const review={protocol_version:1,rules_version:'review-v1',journal:'default',review_hash:'review-hash',issues:[issue('R1:font','set_style',{fontSize:20}),issue('R2:s1','set_series',{seriesId:config.series[0].id,width:3}),{id:'R6:unknown',rule:'R6',severity:'warning',title:'请确认误差',detail:'不得猜测',fixable:false,fix:[],anchor:{kind:'title',ref:'title'}}],passed:['R4'],skipped:[]};
  let lastConfig=proposed;const decisions:Record<string,any>[]=[];
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    let body:unknown=run;
    if(url.endsWith('/provider'))body={available:true,model:'fixture',endpoint:'http://127.0.0.1'};
    else if(url.endsWith('/review'))body=review;
    else if(url.endsWith('/preview')){
      const request=JSON.parse(String(init?.body));lastConfig=structuredClone(request.config);
      for(const operation of request.operations){if(operation.tool==='set_style')Object.assign(lastConfig.style,operation.arguments);else if(operation.tool==='set_series')lastConfig.series[0].width=operation.arguments.width;}
      body={...run.proposal,config:lastConfig,operation_count:request.operations.length};
    }else if(url.endsWith('/lint'))body={ok:true};
    else if(url.endsWith('/decision')){decisions.push(JSON.parse(String(init?.body)));body={...run,outcome:'accepted',config:lastConfig};}
    return {ok:true,json:async()=>body};
  });vi.stubGlobal('fetch',fetcher);
  const onApply=vi.fn((_token:string,_config:Config,_count:number)=>true);const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><AgentAssistant project={1} chartId={1} revision={1} config={config} data={data} token="baseline" onApply={onApply} onClose={()=>{}}/></QueryClientProvider>);
  fireEvent.change(await screen.findByRole('textbox',{name:'希望怎样调整？'}),{target:{value:'把图例放右侧'}});
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'生成调整提案'}));
  await screen.findByRole('heading',{name:'审稿修复 · 可逐条取消'});expect(screen.getByRole('heading',{name:'你要求的修改'})).toBeTruthy();expect(screen.getByRole('heading',{name:'审稿意见 · 不改图'})).toBeTruthy();
  await waitFor(()=>expect(screen.getByRole('button',{name:'应用这组调整'})).toBeEnabled());
  fireEvent.click(screen.getByRole('checkbox',{name:'修复 线条太细'}));
  await waitFor(()=>expect(lastConfig.series[0].width).toBe(.5));await waitFor(()=>expect(screen.getByRole('button',{name:'应用这组调整'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'应用这组调整'}));
  await waitFor(()=>expect(onApply).toHaveBeenCalled());expect(decisions[0]).toMatchObject({accepted_fixes:['R1:font'],review_hash:'review-hash'});
  expect(onApply.mock.calls[0][1]).toMatchObject({style:{fontSize:20},legend:{position:'right'}});
  expect((onApply.mock.calls[0] as any)[1].series[0].width).toBe(.5);
});
