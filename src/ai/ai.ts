import { Action, applyAction, availableActions, Color, GameState, occupied, other, Vertex } from '../engine/engine';
import { getBoard } from '../engine/boards';

export type Difficulty = 'easy' | 'medium' | 'hard';
/** Quick, rules-engine-generated recovery action if the background worker fails. */
export function firstLegalAction(state: GameState): Action {
  const action = availableActions(state)[0];
  if (!action) throw new Error('No action available');
  return action;
}
function score(state: GameState, root: Color): number {
  if (state.outcome === root) return 100000; if (state.outcome === other(root)) return -100000; if (state.outcome === 'draw') return 0;
  const board=getBoard(state.boardId);
  const positionValue=(color:Color)=>{
    const stones=Object.values(state.pieces).filter(p=>p.color===color&&p.position).map(p=>p.position as Vertex);
    const targets=board.victoryPositions[color];
    let value=stones.length*2;
    for(const target of targets) if(occupied(state,target)?.color===color)value+=24;
    for(const target of targets){
      if(occupied(state,target)?.color===color)continue;
      const distances=stones.map(from=>shortestDistance(board,from,target));
      const distance=distances.length?Math.min(...distances):8;
      value+=Math.max(0,12-distance*2);
    }
    for(const home of board.startingPositions[color]) if(!occupied(state,home)) value-=2;
    return value;
  };
  return positionValue(root)-positionValue(other(root));
}
const distanceCache=new Map<string,number>();
function shortestDistance(board:ReturnType<typeof getBoard>,from:Vertex,to:Vertex):number{
  if(from===to)return 0;
  const key=`${board.id}:${from}:${to}`;const cached=distanceCache.get(key);if(cached!==undefined)return cached;
  const adjacency=new Map<string,Set<string>>();
  for(const track of board.tracks) for(let i=0;i<track.length-1;i++){
    const a=track[i],b=track[i+1];if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a)!.add(b);adjacency.get(b)!.add(a);
  }
  const queue:[[string,number]]=[[from,0]],seen=new Set([from]);
  while(queue.length){const [vertex,distance]=queue.shift()!;for(const next of adjacency.get(vertex)??[]){if(next===to){distanceCache.set(key,distance+1);return distance+1;}if(!seen.has(next)){seen.add(next);queue.push([next,distance+1]);}}}
  distanceCache.set(key,99);return 99;
}
function randomSeeded(actions: Action[], seed: number): Action { return actions[Math.abs(seed) % actions.length]; }
export function chooseAction(state: GameState, difficulty: Difficulty, seed = 0): Action {
  const actions = availableActions(state); if (!actions.length) throw new Error('No action available');
  if (difficulty === 'easy') return randomSeeded(actions, seed + state.history.length * 17);
  if (difficulty === 'medium') return actions.slice().sort((a,b) => score(applyAction(state,b), state.turn) - score(applyAction(state,a), state.turn))[0];
  let best = actions[0]; let bestValue = -Infinity; const table = new Map<string, number>();
  for (const action of actions) { const next = applyAction(state, action); const value = minimax(next, next.turn, state.turn, 3, -Infinity, Infinity, table); if (value > bestValue) { bestValue = value; best = action; } }
  return best;
}
function minimax(state: GameState, turn: Color, root: Color, depth: number, alpha: number, beta: number, table: Map<string, number>): number {
  if (depth === 0 || state.outcome) return score(state, root); const key = JSON.stringify([state.boardId,state.pieces,state.turn,state.lastVoluntaryMovedStone,state.lastMovedStone,state.pendingReturns,state.consecutivePasses,depth]); const saved = table.get(key); if (saved !== undefined) return saved;
  const actions = availableActions(state); let value = turn === root ? -Infinity : Infinity;
  for (const action of actions) { const next = applyAction(state, action); const child = minimax(next, other(turn), root, depth - 1, alpha, beta, table); if (turn === root) { value = Math.max(value, child); alpha = Math.max(alpha, value); } else { value = Math.min(value, child); beta = Math.min(beta, value); } if (beta <= alpha) break; }
  table.set(key, value); return value;
}
