import { applyAction, createInitialState } from '../engine/engine';
import { chooseAction } from './ai';

for(let seed=1;seed<=8;seed++){
  let state=createInitialState('BH24');
  const white=seed%2?'medium':'easy';const black=seed%2?'easy':'medium';
  for(let ply=0;ply<600&&!state.outcome;ply++){
    const difficulty=state.turn==='white'?white:black;
    const next=applyAction(state,chooseAction(state,difficulty,seed*97+ply));
    state={...next,timeline:next.timeline.slice(-1)};
  }
  console.log(JSON.stringify({seed,white,black,outcome:state.outcome??'unresolved-at-600-ply-test-cutoff',plies:state.history.length}));
}
