import {expect, it} from 'vitest';
import {journalPreset, journalRule} from './journals';
import {defaultPublication, type Config} from './model';

it('preserves old optional publication and chooses verified widths without changing other settings', () => {
  const c = {publication: {...defaultPublication, widthMm: 88}} as Config;
  const original = JSON.stringify(c);
  expect(journalRule().min_font_pt).toBe(6);
  expect(journalPreset(c, 'nature').publication).toMatchObject({widthMm: 89, journal: 'nature', enabled: false});
  c.publication!.widthMm = 180;
  expect(journalPreset(c, 'ieee').publication?.widthMm).toBe(182);
  expect(journalPreset(c, 'plos-one').publication?.widthMm).toBe(180);
  expect(JSON.parse(original).publication.journal).toBeUndefined();
});
