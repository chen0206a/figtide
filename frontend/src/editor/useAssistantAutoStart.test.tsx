import {StrictMode,useState} from 'react';
import {render,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useAssistantAutoStart} from './useAssistantAutoStart';
it('StrictMode and later re-renders delegate one explicit submission to start exactly once',async()=>{
 const start=vi.fn(async()=>{}),submission={id:'once',prompt:'加粗曲线',consent:true};
 function Harness({ready}:{ready:boolean}){const [prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false);useAssistantAutoStart({submission,ready,prompt,consent,setPrompt,setConsent,start,recoveringExisting:false});return null;}
 const view=render(<StrictMode><Harness ready={false}/></StrictMode>);expect(start).not.toHaveBeenCalled();
 view.rerender(<StrictMode><Harness ready/></StrictMode>);await waitFor(()=>expect(start).toHaveBeenCalledTimes(1));view.rerender(<StrictMode><Harness ready/></StrictMode>);expect(start).toHaveBeenCalledTimes(1);
});
it('does not automatically replay a recovered run or a nonconsenting prompt',()=>{
 const start=vi.fn(async()=>{});
 function Harness(){const [prompt,setPrompt]=useState('调整'),[consent,setConsent]=useState(false);useAssistantAutoStart({autoStart:true,initialPrompt:'调整',initialConsent:true,ready:true,prompt,consent,setPrompt,setConsent,start,recoveringExisting:true});return null;}
 render(<Harness/>);expect(start).not.toHaveBeenCalled();
});
