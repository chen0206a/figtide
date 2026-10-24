import {afterEach,expect,it,vi} from 'vitest';
import {render,waitFor} from '@testing-library/react';
import FigurePreview from './FigurePreview';
import {defaults} from './model';
import type {Dataset} from '../lib/api';
const plot=vi.hoisted(()=>({react:vi.fn(async()=>{}),purge:vi.fn()}));
vi.mock('plotly.js-cartesian-dist-min',()=>({default:plot}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()});
const data:Dataset={id:1,dataset_id:1,version:1,filename:'synthetic.csv',row_count:2,fields:[{name:'epoch',type:'number',missing:0},{name:'accuracy',type:'number',missing:0}],rows:[{epoch:1,accuracy:.7},{epoch:2,accuracy:.9}],warnings:[],sha256:'demo'};
function observer(){vi.stubGlobal('ResizeObserver',class{constructor(private callback:ResizeObserverCallback){}observe(){this.callback([{contentRect:{width:400}}] as ResizeObserverEntry[],{} as ResizeObserver)}disconnect(){}})}
it('fit renders at measured width with no CSS scale and leaves the saved config unchanged',async()=>{
 observer();const config=defaults(data),before=structuredClone(config);const view=render(<FigurePreview config={config} data={data} mode="fit" maxHeight={500}/>);
 await waitFor(()=>expect(plot.react).toHaveBeenCalled());const call=plot.react.mock.calls.at(-1) as unknown as [HTMLElement,unknown,{width:number;height:number;font:{size:number}}];
 expect(call[2].width).toBe(400);expect(call[2].height).toBeCloseTo(400*500/760);expect(call[2].font.size).toBe(config.style.fontSize);
 expect(view.getByTestId('figure-preview-plot').style.transform).toBe('none');expect(config).toEqual(before);
});
it('default exact mode retains original Plotly dimensions for style-library previews',async()=>{
 observer();const config=defaults(data);render(<FigurePreview config={config} data={data}/>);await waitFor(()=>expect(plot.react).toHaveBeenCalled());
 const call=plot.react.mock.calls.at(-1) as unknown as [HTMLElement,unknown,{width:number;height:number}];expect(call[2]).toMatchObject({width:760,height:500});
});
