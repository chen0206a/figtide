import rules from './journal-rules-v1.json';
import {defaultPublication, type Config} from './model';

export const journalRules = rules;
export function journalRule(id = 'default') {
  return journalRules.find(rule => rule.id === id) || journalRules[0];
}
export function journalPreset(c: Config, journal: string): Partial<Config> {
  const p = c.publication || defaultPublication;
  const rule = journalRule(journal);
  const double = p.widthMm >= 150;
  return {publication: {...p, journal: rule.id,
    widthMm: (double ? rule.double_column_mm : rule.single_column_mm) ?? (double ? 180 : 88)}};
}
