import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const id='bio-f-actin',svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#0072B2"/></svg>';
beforeEach(()=>vi.resetModules());afterEach(()=>vi.unstubAllGlobals());
it('fetches no SVG at module load, deduplicates concurrent requests, and reuses successful cached vectors',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(svg));vi.stubGlobal('fetch',fetch);const cache=await import('./iconCache');expect(fetch).not.toHaveBeenCalled();
  const [a,b]=await Promise.all([cache.loadIcon(id),cache.loadIcon(id)]);expect(a).toBe(svg);expect(b).toBe(svg);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('/api/diagram-icons/bio-f-actin.svg');expect(await cache.loadIcon(id)).toBe(svg);expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects arbitrary paths and unsafe responses, then permits an explicit retry',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).mockResolvedValueOnce(new Response(svg));vi.stubGlobal('fetch',fetch);const cache=await import('./iconCache');await expect(cache.loadIcon('../private')).rejects.toThrow('未知');expect(fetch).not.toHaveBeenCalled();await expect(cache.loadIcon(id)).rejects.toThrow('安全');expect(cache.cachedIcons()[id]).toBeUndefined();await expect(cache.loadIcon(id)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);expect(await cache.loadIcon(id,true)).toBe(svg);expect(fetch).toHaveBeenCalledTimes(2);
});
it('prepares only used unique IDs and rejects missing assets so export cannot silently drop an icon',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response('unavailable',{status:503})).mockResolvedValueOnce(new Response(svg));vi.stubGlobal('fetch',fetch);const cache=await import('./iconCache');const doc={nodes:[{kind:'icon',icon:id},{kind:'icon',icon:id},{kind:'glyph',icon:null}]} as any;
  await expect(cache.prepareDiagramIcons(doc)).rejects.toThrow('503');expect(fetch).toHaveBeenCalledTimes(1);const loaded=await cache.prepareDiagramIcons(doc);expect(loaded[id]).toBe(svg);expect(Object.keys(loaded)).toEqual([id]);expect(fetch).toHaveBeenCalledTimes(2);
});
