import {act,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useReveal} from './useReveal';
afterEach(()=>vi.unstubAllGlobals());
function View(){const ref=useReveal();return <main ref={ref}><div className="reveal" data-testid="reveal"/><div className="reveal" data-demo="true" data-testid="demo"/></main>}
const entry=(target:HTMLElement,isIntersecting:boolean):IntersectionObserverEntry=>({target,isIntersecting,time:0,intersectionRatio:isIntersecting?1:0,boundingClientRect:target.getBoundingClientRect(),intersectionRect:target.getBoundingClientRect(),rootBounds:null});
it('reveals once and pauses the illustrative loop outside the viewport',()=>{
  let callback:IntersectionObserverCallback=()=>{};
  const stop=vi.fn(),unobserve=vi.fn();
  vi.stubGlobal('IntersectionObserver',class {constructor(cb:IntersectionObserverCallback){callback=cb}observe=vi.fn();unobserve=unobserve;disconnect=stop;});
  const v=render(<View/>),node=v.getByTestId('reveal'),demo=v.getByTestId('demo');
  expect(node).toHaveAttribute('data-reveal','pending');
  act(()=>callback([entry(node,true),entry(demo,true)],{} as IntersectionObserver));
  expect(node).toHaveAttribute('data-in','true');expect(node).not.toHaveAttribute('data-reveal');expect(unobserve).toHaveBeenCalledWith(node);
  act(()=>callback([entry(demo,false)],{} as IntersectionObserver));
  expect(demo).toHaveAttribute('data-playing','false');v.unmount();expect(stop).toHaveBeenCalled();
});
it('without an observer the content stays visible',()=>{
  vi.stubGlobal('IntersectionObserver',undefined);const v=render(<View/>);expect(v.getByTestId('reveal')).not.toHaveAttribute('data-reveal');
});
it('reduced motion never hides content behind reveal',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  const v=render(<View/>);expect(v.getByTestId('reveal')).not.toHaveAttribute('data-reveal');
});
