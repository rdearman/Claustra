import { GameSnapshot, GameState, snapshot } from './engine';

/** Returns recorded states only; replay never re-runs the rules engine. */
export function replaySnapshots(state: GameState): GameSnapshot[] {
  return state.timeline?.length ? state.timeline.map(snapshot) : [snapshot(state)];
}
