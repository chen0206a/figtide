import {act,renderHook} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useEffect} from 'react';
import {render,screen} from '@testing-library/react';
import {useProposalCanvas,type CanvasProposal} from './useProposalCanvas';
const proposal={token:'base',preview:{config:{style:{title:'Preview only'}}}} as CanvasProposal;
it('preview/toggle never writes storage or edits its immutable input',()=>{
 const write=vi.spyOn(Storage.prototype,'setItem'),before=structuredClone(proposal);
 const hook=renderHook(()=>useProposalCanvas('base',true));act(()=>hook.result.current.receive(proposal));expect(hook.result.current.proposal).toBe(proposal);
 act(()=>hook.result.current.toggle());expect(hook.result.current.visible).toBe(false);expect(proposal).toEqual(before);expect(write).not.toHaveBeenCalled();write.mockRestore();
});
it('closing or changing the baseline clears preview and reopening does not resurrect it',()=>{
 const hook=renderHook(({token,open})=>useProposalCanvas(token,open),{initialProps:{token:'base',open:true}});
 act(()=>hook.result.current.receive(proposal));hook.rerender({token:'base',open:false});expect(hook.result.current.proposal).toBeNull();hook.rerender({token:'base',open:true});expect(hook.result.current.proposal).toBeNull();
 act(()=>hook.result.current.receive(proposal));hook.rerender({token:'edited',open:true});expect(hook.result.current.proposal).toBeNull();
});
it('a child reannouncing the still-valid proposal on reopen is not erased by the parent effect',()=>{
 function Child({open,receive}:{open:boolean;receive:(value:CanvasProposal|null)=>void}){useEffect(()=>receive(open?proposal:null),[open,receive]);return null;}
 function View({open}:{open:boolean}){const state=useProposalCanvas('base',open);return <><Child open={open} receive={state.receive}/><output>{state.proposal?'preview':'original'}</output></>}
 const view=render(<View open/>);expect(screen.getByRole('status')).toHaveTextContent('preview');view.rerender(<View open={false}/>);expect(screen.getByRole('status')).toHaveTextContent('original');view.rerender(<View open/>);expect(screen.getByRole('status')).toHaveTextContent('preview');
});
