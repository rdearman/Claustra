import { formatMove, formatResult, vertexToTDAN } from '../notation/tdan';
import { BOARD_DEFINITIONS, BoardDefinition, Color, getBoard, Vertex, DEFAULT_BOARD_ID } from './boards';

export { BOARD_DEFINITIONS, getBoard };
export type { BoardDefinition, Vertex, Color };
export const VERTICES = BOARD_DEFINITIONS.TD19.vertices;
export type StoneId = `${Color}-${1|2|3|4}`;
export type Piece = { id: StoneId; color: Color; position: Vertex | null };
export type Outcome = Color | 'draw' | null;
export type Action =
  | { kind: 'move'; stoneId: StoneId; from: Vertex | null; to: Vertex }
  | { kind: 'return'; stoneId: StoneId; to: Vertex }
  | { kind: 'pass' };
export type PendingReturns = { color: Color; stoneIds: StoneId[]; index: number; capturedFrom?: Partial<Record<StoneId, Vertex>> };
export type GameSnapshot = {
  boardId: string;
  boardDefinitionVersion: number;
  pieces: Record<StoneId, Piece>;
  turn: Color;
  lastVoluntaryMovedStone: Record<Color, StoneId | null>;
  lastMovedStone: StoneId | null;
  consecutivePasses: number;
  outcome: Outcome;
  pendingReturns: PendingReturns | null;
  history: string[];
};
export type GameState = GameSnapshot & { timeline: GameSnapshot[] };

export const TRACKS = BOARD_DEFINITIONS.TD19.tracks;
export const WHITE_HOMES = BOARD_DEFINITIONS.TD19.startingPositions.white;
export const BLACK_HOMES = BOARD_DEFINITIONS.TD19.startingPositions.black;
export const BLACK_VICTORY_TARGETS = BOARD_DEFINITIONS.TD19.victoryPositions.black;
export const WHITE_VICTORY_TARGETS = BOARD_DEFINITIONS.TD19.victoryPositions.white;

export function other(color: Color): Color { return color === 'white' ? 'black' : 'white'; }
export function homes(color: Color, boardId = DEFAULT_BOARD_ID): readonly Vertex[] { return getBoard(boardId).startingPositions[color]; }
export function createInitialState(boardId = DEFAULT_BOARD_ID): GameState {
  const board = getBoard(boardId);
  const positions = board.startingPositions;
  const pieces = {} as Record<StoneId, Piece>;
  (['white','black'] as Color[]).forEach(color => positions[color].forEach((position, i) => {
    const id = `${color}-${i + 1}` as StoneId; pieces[id] = { id, color, position };
  }));
  const state = { boardId: board.id, boardDefinitionVersion: board.definitionVersion, pieces, turn: 'white' as Color, lastVoluntaryMovedStone: { white: null, black: null }, lastMovedStone: null, consecutivePasses: 0, outcome: null as Outcome, pendingReturns: null, history: [] as string[] };
  return { ...state, timeline: [snapshot(state)] };
}
export function snapshot(state: GameSnapshot): GameSnapshot { const { timeline: _timeline, ...withoutTimeline } = state as GameState; return JSON.parse(JSON.stringify(withoutTimeline)); }
function commit(previous: GameState, next: GameSnapshot): GameState { return { ...next, timeline: [...(previous.timeline ?? [snapshot(previous)]), snapshot(next)] }; }
export function occupied(state: GameSnapshot, vertex: Vertex): Piece | undefined { return Object.values(state.pieces).find(p => p.position === vertex); }
function canLand(color: Color, vertex: Vertex, state: GameSnapshot): boolean { const board = getBoard(state.boardId); const protectedOwner = (['white','black'] as Color[]).find(owner => board.protectedPositions[owner].includes(vertex)); return !occupied(state, vertex) && (!protectedOwner || protectedOwner === color); }
function destinations(state: GameSnapshot, from: Vertex): Vertex[] {
  const result = new Set<Vertex>();
  for (const track of getBoard(state.boardId).tracks) {
    const index = track.indexOf(from); if (index < 0) continue;
    for (const dir of [-1, 1]) for (let i = index + dir; i >= 0 && i < track.length; i += dir) {
      const v = track[i]; if (occupied(state, v)) break; result.add(v);
    }
  }
  return [...result];
}
export function legalActions(state: GameSnapshot, color = state.turn): Action[] {
  if (state.outcome || state.pendingReturns || color !== state.turn) return [];
  const actions: Action[] = [];
  const restrictedStone = state.lastVoluntaryMovedStone?.[color] ?? (state.lastMovedStone && state.pieces[state.lastMovedStone]?.color === color ? state.lastMovedStone : null);
  for (const piece of Object.values(state.pieces)) if (piece.color === color && piece.id !== restrictedStone) {
    if (piece.position) {
      for (const to of destinations(state, piece.position)) if (canLand(color, to, state)) actions.push({ kind: 'move', stoneId: piece.id, from: piece.position, to });
    } else {
      for (const to of homes(color,state.boardId)) if (canLand(color, to, state)) actions.push({ kind: 'move', stoneId: piece.id, from: null, to });
    }
  }
  if (!actions.length) actions.push({ kind: 'pass' });
  return actions;
}
function capturesAfterMove(state: GameState, to: Vertex, color: Color): StoneId[] {
  const ids = new Set<StoneId>();
  for (const track of getBoard(state.boardId).tracks) { const i = track.indexOf(to); if (i < 0) continue;
    const rays = [-1, 1].map(direction => {
      const found: Piece[] = [];
      for (let cursor = i + direction; cursor >= 0 && cursor < track.length; cursor += direction) {
        const piece = occupied(state, track[cursor]);
        if (piece) { found.push(piece); if (found.length === 2) break; }
      }
      return found;
    });
    for (const side of [0, 1] as const) {
      const defender = rays[side][0];
      const farAttacker = rays[side][1];
      if (defender?.color === other(color) && farAttacker?.color === color) ids.add(defender.id);
    }
  }
  return [...ids];
}
export function checkVictory(state: GameSnapshot): Outcome {
  const board = getBoard(state.boardId);
  for (const color of ['white','black'] as Color[]) { const target = board.victoryPositions[color]; if (target.every(v => occupied(state, v)?.color === color)) return color; }
  return null;
}
export function applyAction(state: GameState, action: Action): GameState {
  if (state.outcome) throw new Error('Game is over');
  if (state.pendingReturns && action.kind !== 'return') throw new Error('A captured stone must be returned first');
  if (action.kind === 'return') return applyReturn(state, action);
  const legal = legalActions(state); if (!legal.some(a => JSON.stringify(a) === JSON.stringify(action))) throw new Error('Illegal action');
  if (action.kind === 'pass') {
    const passes = state.consecutivePasses + 1; const outcome = passes >= 2 ? 'draw' as const : null; const history = [...state.history, formatMove({ from: null, to: null, pass: true },state.boardId)]; if (outcome) history.push(formatResult(outcome)!); return commit(state, { ...state, turn: other(state.turn), consecutivePasses: passes, outcome, history });
  }
  const pieces = { ...state.pieces, [action.stoneId]: { ...state.pieces[action.stoneId], position: action.to } };
  const lastVoluntaryMovedStone = { ...(state.lastVoluntaryMovedStone ?? { white: null, black: null }), [state.turn]: action.stoneId } as Record<Color, StoneId | null>;
  const moved = { ...state, pieces, lastVoluntaryMovedStone, lastMovedStone: action.stoneId, consecutivePasses: 0, history: [...state.history, formatMove({ from: action.from, to: action.to },state.boardId)] };
  const captured = capturesAfterMove(moved, action.to, state.turn);
  const capturedVertices = captured.map(id => moved.pieces[id].position).filter((position): position is Vertex => position !== null);
  for (const id of captured) pieces[id] = { ...pieces[id], position: null };
  if (captured.length) moved.history[moved.history.length - 1] = formatMove({ from: action.from, to: action.to, captures: capturedVertices },state.boardId);
  const afterCapture = { ...moved, pieces, outcome: captured.length ? null : checkVictory(moved) };
  if (!captured.length) { const history = afterCapture.outcome ? [...afterCapture.history, formatResult(afterCapture.outcome)!] : afterCapture.history; return commit(state, { ...afterCapture, turn: other(state.turn), history }); }
  return commit(state, advancePendingReturns({ ...afterCapture, turn: other(state.turn), pendingReturns: { color: other(state.turn), stoneIds: captured, index: 0, capturedFrom: Object.fromEntries(captured.map((id, index) => [id, capturedVertices[index]])) as Partial<Record<StoneId, Vertex>> } }));
}
function advancePendingReturns(state: GameState): GameState {
  const pending = state.pendingReturns; if (!pending) return state;
  let index = pending.index; let history = state.history;
  while (index < pending.stoneIds.length && !homes(pending.color,state.boardId).some(v => canLand(pending.color, v, state))) {
    history = history.length ? [...history.slice(0, -1), `${history[history.length - 1]} [reserve]`] : [...history, '[reserve]']; index++;
  }
  if (index >= pending.stoneIds.length) { const resolved = { ...state, pendingReturns: null, history }; const outcome = checkVictory(resolved); return { ...resolved, outcome, history: outcome ? [...history, formatResult(outcome)!] : history }; }
  return { ...state, pendingReturns: { ...pending, index }, history };
}
function applyReturn(state: GameState, action: Extract<Action, {kind:'return'}>): GameState {
  const pending = state.pendingReturns; if (!pending || pending.color !== state.turn) throw new Error('Not awaiting this return');
  const id = pending.stoneIds[pending.index]; if (action.stoneId !== id || !homes(pending.color,state.boardId).includes(action.to) || !canLand(pending.color, action.to, state)) throw new Error('Invalid return position');
  const pieces = { ...state.pieces, [id]: { ...state.pieces[id], position: action.to } };
  const returnNotation = `[${vertexToTDAN(pending.capturedFrom?.[id] ?? action.to,state.boardId)}@${vertexToTDAN(action.to,state.boardId)}]`;
  const history = state.history.length ? [...state.history.slice(0, -1), `${state.history[state.history.length - 1]} ${returnNotation}`] : [returnNotation];
  const nextIndex = pending.index + 1; const done = nextIndex >= pending.stoneIds.length;
  if (!done) return commit(state, advancePendingReturns({ ...state, pieces, pendingReturns: { ...pending, index: nextIndex }, history }));
  const resolved = { ...state, pieces, pendingReturns: null, turn: pending.color, history };
  const outcome = checkVictory(resolved); return commit(state, { ...resolved, outcome, history: outcome ? [...history, formatResult(outcome)!] : history });
}
export function allReturnActions(state: GameSnapshot): Action[] { if (!state.pendingReturns) return []; const id = state.pendingReturns.stoneIds[state.pendingReturns.index]; return homes(state.pendingReturns.color,state.boardId).filter(v => canLand(state.pendingReturns!.color, v, state)).map(to => ({ kind: 'return', stoneId: id, to })); }
export function availableActions(state: GameSnapshot): Action[] { return state.pendingReturns ? allReturnActions(state) : legalActions(state); }
export function serialize(state: GameState): string { return JSON.stringify(state); }
export function cloneState(state: GameState): GameState { return JSON.parse(serialize(state)) as GameState; }
