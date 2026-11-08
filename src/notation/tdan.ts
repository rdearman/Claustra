import type { Color, Outcome, Vertex } from '../engine/engine';
import { getBoard } from '../engine/boards';

export type TDANMove = {
  from: Vertex | null;
  to: Vertex | null;
  captures?: Vertex[];
  returns?: Array<{ vertex: Vertex; to: Vertex }>;
  pass?: boolean;
};
export type GameMove = TDANMove;

const TDAN_BY_VERTEX: Record<Vertex, string> = {
  NW: 'B5', T: 'C5', NE: 'D5', UL: 'B4', UR: 'D4', OLT: 'A4', OLM: 'A3', OLB: 'A2',
  LM: 'B3', C: 'C3', RM: 'D3', ORT: 'E4', ORM: 'E3', ORB: 'E2', LL: 'B2', LR: 'D2', SW: 'B1', B: 'C1', SE: 'D1'
};
const VERTEX_BY_TDAN = Object.fromEntries(Object.entries(TDAN_BY_VERTEX).map(([vertex, coordinate]) => [coordinate, vertex])) as Record<string, Vertex>;

export function vertexToTDAN(vertex: string, boardId = 'TD19'): string {
  if (boardId !== 'TD19') {
    if (getBoard(boardId).vertices.includes(vertex)) return vertex;
    throw new Error(`Unknown vertex for ${boardId}: ${vertex}`);
  }
  const coordinate = TDAN_BY_VERTEX[vertex as Vertex];
  if (!coordinate) throw new Error(`Unknown vertex: ${vertex}`);
  return coordinate;
}
export function tdanToVertex(coordinate: string, boardId = 'TD19'): Vertex {
  if (boardId !== 'TD19') {
    const vertex = coordinate.toUpperCase();
    if (getBoard(boardId).vertices.includes(vertex)) return vertex;
    throw new Error(`Invalid ${boardId} coordinate: ${coordinate}`);
  }
  const vertex = VERTEX_BY_TDAN[coordinate.toUpperCase()];
  if (!vertex) throw new Error(`Invalid TDAN coordinate: ${coordinate}`);
  return vertex;
}
export function formatMove(move: TDANMove, boardId = 'TD19'): string {
  if (move.pass) return '--';
  if (!move.to) throw new Error('A TDAN move requires a destination');
  let result = `${move.from ? vertexToTDAN(move.from,boardId) : 'RESERVE'}-${vertexToTDAN(move.to,boardId)}`;
  if (move.captures?.length) result += `x${move.captures.map(v=>vertexToTDAN(v,boardId)).join(',')}`;
  if (move.returns?.length) result += ` ${move.returns.map(item => `[${vertexToTDAN(item.vertex,boardId)}@${vertexToTDAN(item.to,boardId)}]`).join(' ')}`;
  return result;
}
export function formatResult(outcome: Outcome): string | null { return outcome === 'white' ? '1-0' : outcome === 'black' ? '0-1' : outcome === 'draw' ? 'x-x' : null; }
export function parseResult(value: string): Outcome { const result = value.trim(); if (result === '1-0') return 'white'; if (result === '0-1') return 'black'; if (result === 'x-x' || result === '½-½') return 'draw'; return null; }
export function isASCII(value: string): boolean { return [...value].every(character => character.charCodeAt(0) <= 0x7f); }

function migrateLegacyTD19Entry(entry: string): string {
  if (entry === 'white passes' || entry === 'black passes' || entry === '--') return '--';
  if (entry === '1-0' || entry === '0-1' || entry === 'x-x' || entry === '½-½') return entry === '½-½' ? 'x-x' : entry;
  const move = entry.match(/^(?:white|black)\s+(\S+)\s+→\s+(\S+)(?:\s+·\s+captures\s+(\d+))?/);
  if (move) {
    const from = move[1].toLowerCase() === 'reserve' ? 'RESERVE' : vertexToTDAN(move[1]);
    return `${from}-${vertexToTDAN(move[2])}${move[3] ? `x?${move[3]}` : ''}`;
  }
  const returned = entry.match(/^(?:white|black) returns to (\S+)$/);
  if (returned) return `[${vertexToTDAN(returned[1])}@${vertexToTDAN(returned[1])}]`;
  if (entry.includes('captured stone enters reserve')) return '[reserve]';
  return entry;
}
export function formatGameHistory(history: Array<string | GameMove>, boardId = 'TD19'): string[] {
  const lines: string[] = []; let turn = 1; let white: string | null = null;
  for (const raw of history) {
    const entry = typeof raw === 'string' ? migrateLegacyEntry(raw,boardId) : formatMove(raw,boardId);
    if (parseResult(entry)) { if (white !== null) { lines.push(`${turn}. ${white}`); white = null; turn++; } lines.push(entry); continue; }
    if (white === null) white = entry;
    else { lines.push(`${turn}. ${white}       ${entry}`); white = null; turn++; }
  }
  if (white !== null) lines.push(`${turn}. ${white}`);
  return lines;
}

export function formatGameRecord(history: Array<string | GameMove>, boardId: string, white = 'Human', black = 'Computer', outcome: Outcome = null): string {
  const boardName = getBoard(boardId).id;
  const result = formatResult(outcome) ?? [...history].reverse().find(entry => typeof entry === 'string' && parseResult(entry)) ?? '*';
  return [`[Game "Claustra Strategy"]`, `[Board "${boardName}"]`, `[White "${white}"]`, `[Black "${black}"]`, `[Result "${result}"]`, '', ...formatGameHistory(history, boardName)].join('\n');
}

function migrateLegacyEntry(entry: string, boardId: string): string {
  if (boardId === 'TD19') return migrateLegacyTD19Entry(entry);
  if (entry === 'white passes' || entry === 'black passes' || entry === '--') return '--';
  if (entry === '1-0' || entry === '0-1' || entry === 'x-x' || entry === '½-½') return entry === '½-½' ? 'x-x' : entry;
  return entry.replace(/\b(?:NW|NE|SW|SE|OLT|OLM|OLB|ORT|ORM|ORB|UL|UR|LL|LR|LM|RM|T|C|B)\b/g, token => vertexToTDAN(token,boardId));
}

export function resultForColor(color: Color): string { return color === 'white' ? '1-0' : '0-1'; }
