import {afterEach,expect,it} from 'vitest';
import {budgetPreferenceKey,readBudgetPreferences,storeBudgetPreferences} from './agentBudgetPreferences';
afterEach(()=>localStorage.removeItem(budgetPreferenceKey));
it('restores a valid shared or custom budget and ignores corrupted preferences',()=>{
  expect(readBudgetPreferences()).toEqual({runLimit:60000,roles:null});
  storeBudgetPreferences({runLimit:48000,roles:{coordinator:50,data:10,plotter:25,reviewer:15}});
  expect(readBudgetPreferences().roles?.coordinator).toBe(50);
  localStorage.setItem(budgetPreferenceKey,'{"runLimit":-1}');
  expect(readBudgetPreferences()).toEqual({runLimit:60000,roles:null});
});
it('does not persist a partially edited invalid sum',()=>{
  storeBudgetPreferences({runLimit:48000,roles:null});
  storeBudgetPreferences({runLimit:48000,roles:{coordinator:50,data:30,plotter:40,reviewer:15}});
  expect(readBudgetPreferences()).toEqual({runLimit:48000,roles:null});
});
