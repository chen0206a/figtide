import {afterEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useReducer} from 'react';
import {api} from '../lib/api';
import {ReviewDock} from './ReviewDock';
import {defaults,historyReducer} from './model';
import type {Dataset} from '../lib/api';
import type {ReviewResult} from './review';
import {ReviewMarkers} from './workbench/ReviewMarkers';
vi.mock('../lib/api',async importOriginal=>({...await importOriginal<typeof import('../lib/api')>(),api:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
const data:Dataset={id:1,dataset_id:1,version:1,filename:'synthetic.csv',sha256:'abc',row_count:2,fields:[{name:'x',type:'number',missing:0},{name:'y',type:'number',missing:0}],rows:[{x:1,y:2},{x:2,y:3}],warnings:[]};
const report:ReviewResult={protocol_version:1,rules_version:'review-v1',journal:'default',issues:[
  {id:'R1:font',rule:'R1',severity:'warning',title:'字号太小',detail:'合成测试',fixable:true,fix:[{tool:'set_style',arguments:{fontSize:20}}],anchor:{kind:'axis',ref:'y'}},
  {id:'R2:s1',rule:'R2',severity:'warning',title:'线条太细',detail:'合成测试',fixable:true,fix:[{tool:'set_series',arguments:{seriesId:'s1',width:3}}],anchor:{kind:'series',ref:'s1'}},
],passed:['R4'],skipped:[{rule:'R7',reason:'需要编辑器中的渲染信息'}]};
it('defaults repairs on, ignores/restores locally, previews only selected fixes and applies one reversible edit',async()=>{
  const onPreview=vi.fn(),onIssues=vi.fn();let previewCalls=0;
  vi.mocked(api).mockImplementation(async(path,options)=>{
    if(path.endsWith('/review'))return structuredClone(report) as any;
    if(path.endsWith('/preview')){
      const body=JSON.parse(String(options?.body));previewCalls++;
      expect(body.operations).toEqual([report.issues[0].fix[0]]);
      const config=structuredClone(body.config);config.style.fontSize=20;
      return {protocol_version:1,config,base_revision:1,operation_count:1,changes:[{path:'/style/fontSize',before:14,after:20}],source:{dataset_version_id:1,sha256:'abc'}} as any;
    }throw new Error('unexpected '+path);
  });
  function Harness(){
    const [history,dispatch]=useReducer(historyReducer,{past:[],present:defaults(data),future:[]});
    return <><ReviewDock open project={1} chartId={1} revision={1} config={history.present} data={data} token={JSON.stringify(history.present)} onClose={()=>{}} onPreview={onPreview} onIssues={onIssues} onPhysicalWidth={()=>{}} onApply={(_,config)=>{dispatch({type:'edit',value:config});return true}}/>
      <output aria-label="草稿字号">{history.present.style.fontSize}</output><button onClick={()=>dispatch({type:'undo'})}>测试撤销</button></>;
  }
  render(<Harness/>);
  const font=await screen.findByRole('checkbox',{name:'修复 字号太小'}),line=screen.getByRole('checkbox',{name:'修复 线条太细'});
  expect(font).toBeChecked();expect(line).toBeChecked();expect(screen.getByRole('checkbox',{name:/深度审稿/})).toBeEnabled();expect(screen.getByRole('checkbox',{name:/深度审稿/})).not.toBeChecked();
  fireEvent.click(screen.getAllByRole('button',{name:'忽略'})[0]);expect(font).not.toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:'恢复'}));expect(font).toBeChecked();
  fireEvent.click(line);fireEvent.click(screen.getByRole('button',{name:'预览修复所选（1）'}));
  await screen.findByRole('button',{name:'应用到草稿'});expect(screen.getByLabelText('草稿字号')).toHaveTextContent('14');
  fireEvent.click(screen.getByRole('button',{name:'应用到草稿'}));await waitFor(()=>expect(screen.getByLabelText('草稿字号')).toHaveTextContent('20'));
  fireEvent.click(screen.getByRole('button',{name:'测试撤销'}));expect(screen.getByLabelText('草稿字号')).toHaveTextContent('14');
  expect(previewCalls).toBe(2);expect(vi.mocked(api).mock.calls.some(([path])=>path.includes('/charts'))).toBe(false);
});
it('renders stable orange review numbers at geometric anchors',()=>{
  const config=defaults(data);const {container}=render(<ReviewMarkers config={config} issues={[{...report.issues[0],number:4}]} facts={{version:1,canvas:{width:760,height:500},plot:{x:70,y:60,width:600,height:350},texts:[],points:[],bands:[]}}/>);
  expect(container.querySelector('[data-change-number="4"]')).toBeTruthy();expect(container.querySelector('.review-markers')).toBeTruthy();
});
