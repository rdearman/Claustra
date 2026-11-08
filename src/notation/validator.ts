import { applyAction, createInitialState, GameState, legalActions, StoneId } from '../engine/engine';
import { BOARD_DEFINITIONS } from '../engine/boards';
import { tdanToVertex, vertexToTDAN } from './tdan';

export type TDANValidation = { valid: true; state: GameState } | { valid: false; move: number; side: 'white' | 'black'; notation: string; reason: string };

const MOVE = /(?:RESERVE|[A-I][1-7])-[A-I][1-7](?:x[A-I][1-7](?:,[A-I][1-7])*)?(?:\s+\[[^\]]+\])*/g;

function moveTokens(record: string): string[] {
  return record.split(/\r?\n/).flatMap(line => [...line.matchAll(MOVE)].map(match => match[0].trim()).concat(line.includes('--') ? ['--'] : []));
}

function findStone(state: GameState, from: string, to: string, boardId: string): StoneId | null {
  const destination = tdanToVertex(to,boardId);
  if (from === 'RESERVE') {
    return (legalActions(state).find(action => action.kind === 'move' && action.from === null && action.to === destination) as { stoneId: StoneId } | undefined)?.stoneId ?? null;
  }
  const origin = tdanToVertex(from,boardId);
  return (legalActions(state).find(action => action.kind === 'move' && action.from === origin && action.to === destination) as { stoneId: StoneId } | undefined)?.stoneId ?? null;
}

/** Validates a record by applying each move through the rules engine. */
export function validateTDAN(record: string): TDANValidation {
  const boardId = record.match(/^\[Board\s+"([A-Z0-9]+)"\]/m)?.[1] ?? 'TD19';
  if (!BOARD_DEFINITIONS[boardId]) return { valid:false, move:1, side:'white', notation:`[Board "${boardId}"]`, reason:`unknown board identifier ${boardId}` };
  let state = createInitialState(boardId);
  const tokens = moveTokens(record);
  for (let index = 0; index < tokens.length; index++) {
    const notation = tokens[index];
    const side = state.turn;
    const move = index + 1;
    try {
      if (notation === '--') {
        state = applyAction(state, { kind: 'pass' });
        continue;
      }
      const [base, ...annotations] = notation.split(' ');
      const [from, toAndCapture] = base.split('-');
      const to = toAndCapture.split('x')[0];
      const stoneId = findStone(state, from, to,boardId);
      if (!stoneId) {
        if(from!=='RESERVE'){
          const origin=tdanToVertex(from,boardId),piece=Object.values(state.pieces).find(p=>p.position===origin&&p.color===side);
          if(piece&&state.lastVoluntaryMovedStone[side]===piece.id)throw new Error(`stone on ${from} was already moved on this player's previous turn`);
        }
        throw new Error(`no legal ${from}-${to} action on board ${boardId}`);
      }
      const piecesBefore=state.pieces;
      const capturesDeclared=toAndCapture.includes('x')?toAndCapture.split('x')[1].split(','):[];
      state = applyAction(state, { kind: 'move', stoneId, from: from === 'RESERVE' ? null : tdanToVertex(from,boardId), to: tdanToVertex(to,boardId) });
      const actualCaptured=Object.values(piecesBefore).filter(p=>p.color!==side&&p.position!==null&&state.pieces[p.id].position===null).map(p=>vertexToTDAN(p.position!,boardId));
      if(capturesDeclared.sort().join(',')!==actualCaptured.sort().join(','))throw new Error(`capture annotation mismatch; expected ${actualCaptured.join(',')||'no capture'}`);
      const returns = annotations.flatMap(annotation => [...annotation.matchAll(/\[([A-I][1-7])@([A-I][1-7])\]/g)]);
      for (const match of returns) {
        if (!state.pendingReturns) throw new Error(`return ${match[0]} has no captured stone to resolve`);
        const capturedFrom = tdanToVertex(match[1],boardId);
        const stone = state.pendingReturns.stoneIds[state.pendingReturns.index];
        if (state.pendingReturns.capturedFrom?.[stone] !== capturedFrom) throw new Error(`return ${match[0]} does not match the captured stone`);
        state = applyAction(state, { kind: 'return', stoneId: stone, to: tdanToVertex(match[2],boardId) });
      }
      if (state.pendingReturns) throw new Error('capture return is missing');
    } catch (error) {
      return { valid: false, move: Math.ceil(move / 2), side, notation, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  return { valid: true, state };
}

export function describeValidation(result: TDANValidation): string {
  return result.valid ? 'Valid TDAN record' : `Illegal move ${result.move}${result.side === 'white' ? '.' : '...'} ${result.notation}: ${result.reason}`;
}
