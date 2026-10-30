export function tintColor(ink:string,paper:string,amount=.88):string {
  return '#'+[1,3,5].map(i=>Math.round(parseInt(ink.slice(i,i+2),16)*(1-amount)+parseInt(paper.slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');
}
