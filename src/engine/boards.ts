import boxedHexagram from '../../boxed_hexagram_graph.json';

export type Vertex = string;
export type Color = 'white' | 'black';
export interface BoardDefinition {
  readonly id: string;
  readonly name: string;
  readonly definitionVersion: number;
  readonly vertices: readonly Vertex[];
  readonly tracks: readonly (readonly Vertex[])[];
  readonly startingPositions: Readonly<Record<Color, readonly Vertex[]>>;
  readonly protectedPositions: Readonly<Record<Color, readonly Vertex[]>>;
  readonly victoryPositions: Readonly<Record<Color, readonly Vertex[]>>;
  readonly coordinates: Readonly<Record<Vertex, readonly [number, number]>>;
  readonly viewBox: readonly [number, number, number, number];
}

const td19 = {
  id: 'TD19', name: 'Two-Diamond', definitionVersion: 1,
  vertices: ['NW','NE','SW','SE','T','UL','UR','C','LL','LR','B','LM','RM','OLT','OLM','OLB','ORT','ORM','ORB'],
  tracks: [['NW','T','NE'],['NW','UL','LM','LL','SW'],['NE','UR','RM','LR','SE'],['SW','B','SE'],['OLT','OLM','OLB'],['ORT','ORM','ORB'],['OLM','LM','C','RM','ORM'],['T','UL'],['T','UR'],['UL','C','LR'],['UR','C','LL'],['LL','B'],['LR','B']],
  startingPositions: { white: ['NW','NE','OLT','ORT'], black: ['SW','SE','OLB','ORB'] },
  protectedPositions: { white: ['OLT','ORT'], black: ['OLB','ORB'] },
  victoryPositions: { white: ['LL','LR','B'], black: ['T','UL','UR'] },
  coordinates: { NW:[120,120],T:[300,120],NE:[480,120],UL:[120,235],UR:[480,235],LM:[120,350],C:[300,350],RM:[480,350],LL:[120,465],LR:[480,465],SW:[120,580],B:[300,580],SE:[480,580],OLT:[35,210],OLM:[35,350],OLB:[35,490],ORT:[565,210],ORM:[565,350],ORB:[565,490] }, viewBox: [0,0,600,640]
} as const satisfies BoardDefinition;

const bhGraph = boxedHexagram as {
  id: string; name: string; vertices: string[]; tracks: string[][];
  coordinates: Record<string, {x:number;y:number}>;
  start: Record<Color,string[]>; protected: Record<Color,string[]>; victory: Record<Color,string[]>;
};
const bhCoordinates = Object.fromEntries(Object.entries(bhGraph.coordinates).map(([v,p]) => [v, [180+p.x*92, 80+(6-p.y)*80] as const]));
const bh24 = {
  id: bhGraph.id, name: bhGraph.name, definitionVersion: 1,
  vertices: bhGraph.vertices, tracks: bhGraph.tracks,
  startingPositions: bhGraph.start, protectedPositions: bhGraph.protected, victoryPositions: bhGraph.victory,
  coordinates: bhCoordinates, viewBox: [0,0,900,650]
} as const satisfies BoardDefinition;

export const BOARD_DEFINITIONS: Readonly<Record<string, BoardDefinition>> = Object.freeze({ TD19: td19, BH24: bh24 });
export const DEFAULT_BOARD_ID = 'TD19';
export function getBoard(boardId?: string | null): BoardDefinition {
  const id = boardId && BOARD_DEFINITIONS[boardId] ? boardId : DEFAULT_BOARD_ID;
  return BOARD_DEFINITIONS[id];
}
