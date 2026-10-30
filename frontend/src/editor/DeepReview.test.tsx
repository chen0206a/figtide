import {afterEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {api} from '../lib/api';
import {defaults} from './model';
import {DeepReview} from './DeepReview';
import {TeamProgress} from './TeamProgress';
import {AuditTrace} from './AuditTrace';
import type {Dataset} from '../lib/api';
import type {AgentRun} from './AgentAssistant';
vi.mock('../lib/api',async original=>({...await original<typeof import('../lib/api')>(),api:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
const data={id:1,fields:[{name:'epoch',type:'number',missing:0},{name:'accuracy',type:'number',missing:0}],rows:[]} as unknown as Dataset;
const run={run_id:'synthetic-run',session_id:'synthetic-session',mode:'review',phase:'reviewing',status:'running',trace:[],roles:[{role:'reviewer',steps:1,tokens:50,status:'running',summary:'处理中'}],tokens:50} as unknown as AgentRun;
it('does not start a model run until separate consent and reuses the session for another review',async()=>{
  vi.mocked(api).mockImplementation(async(path,options)=>path.endsWith('/runs')?({...run,status:'answered',phase:'answered',deep_review:'请核对单位'} as any):run as any);
  render(<DeepReview project={1} chartId={2} revision={1} config={defaults(data)} target={{journal:'default',width_mm:88}}/>);
  expect(api).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox',{name:/深度审稿/}));expect(api).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'开始深度审稿'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/同意将上述信息/}));fireEvent.click(screen.getByRole('button',{name:'开始深度审稿'}));await screen.findByText('请核对单位');
  const first=JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body));expect(first.mode).toBe('review');expect(first.share_metadata).toBe(true);expect(first).not.toHaveProperty('rows');
  fireEvent.click(screen.getByRole('button',{name:'开始深度审稿'}));await waitFor(()=>expect(api).toHaveBeenCalledTimes(2));expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body)).session_id).toBe('synthetic-session');
});
it('offers explicit cancellation and cancels an owned unfinished call when the panel unmounts',async()=>{
  vi.mocked(api).mockResolvedValue(run as any);const view=render(<DeepReview project={1} chartId={2} revision={1} config={defaults(data)} target={{journal:'default',width_mm:88}}/>);
  fireEvent.click(screen.getByRole('checkbox',{name:/深度审稿/}));fireEvent.click(screen.getByRole('checkbox',{name:/同意将上述信息/}));fireEvent.click(screen.getByRole('button',{name:'开始深度审稿'}));await screen.findByRole('button',{name:'取消深度审稿'});view.unmount();await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith('/cancel'))).toBe(true));
});
it('shows role progress and groups audit tools by role without losing token counts',()=>{
  const trace=[{step:1,event:'model_response',role:'coordinator',tokens:40},{step:2,event:'model_response',role:'data',tokens:50},{step:2,event:'tool',role:'data',name:'propose_processing',ok:true,result:{sha256:'synthetic-hash'}}];
  render(<><TeamProgress run={{...run,mode:'team',trace}}/><AuditTrace trace={trace}/></>);expect(screen.getByRole('region',{name:'协作进度'})).toBeInTheDocument();expect(screen.getByText('数据专家 · 50 token')).toBeInTheDocument();expect(screen.getAllByText(/派生数据处理预览/)).toHaveLength(2);
});
