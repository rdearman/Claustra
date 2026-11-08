import { describe, expect, it } from 'vitest';
import { formatGameHistory, formatGameRecord, formatMove, formatResult, isASCII, parseResult, tdanToVertex, vertexToTDAN } from './tdan';
import { VERTICES } from '../engine/engine';

describe('Two-Diamond Algebraic Notation', () => {
  it('maps every internal vertex in both directions', () => { for (const vertex of VERTICES) expect(tdanToVertex(vertexToTDAN(vertex))).toBe(vertex); });
  it('rejects invalid TDAN coordinates', () => { for (const coordinate of ['A1','A5','C2','C4','E1','E5','Z9']) expect(() => tdanToVertex(coordinate)).toThrow(); });
  it('formats normal, capture, multiple-capture, return and pass moves', () => {
    expect(formatMove({from:'NW',to:'UL'})).toBe('B5-B4');
    expect(formatMove({from:'NW',to:'UL',captures:['UR']})).toBe('B5-B4xD4');
    expect(formatMove({from:'NW',to:'UL',captures:['UR','C'],returns:[{vertex:'UR',to:'OLT'},{vertex:'C',to:'ORT'}]})).toBe('B5-B4xD4,C3 [D4@A4] [C3@E4]');
    expect(formatMove({from:null,to:null,pass:true})).toBe('--');
    expect(formatMove({from:null,to:'NW'})).toBe('RESERVE-B5');
  });
  it('formats numbered turns and ASCII result codes', () => { const history=formatGameHistory(['B5-B4','D1-C1','B4-C3','--','x-x']); expect(history).toEqual(['1. B5-B4       D1-C1','2. B4-C3       --','x-x']); expect(formatResult('white')).toBe('1-0'); expect(formatResult('black')).toBe('0-1'); expect(formatResult('draw')).toBe('x-x'); expect(parseResult('½-½')).toBe('draw'); expect(isASCII(history.join('\n'))).toBe(true); });
  it('migrates legacy move strings without changing saved state keys', () => { expect(formatGameHistory(['white NE → UR','black passes'])).toEqual(['1. D5-D4       --']); expect(formatGameHistory(['white reserve → NW'])).toEqual(['1. RESERVE-B5']); });
  it('formats BH24 coordinates and includes the board identifier in universal game records',()=>{expect(vertexToTDAN('D5','BH24')).toBe('D5');expect(tdanToVertex('E1','BH24')).toBe('E1');expect(formatMove({from:'B7',to:'D5',captures:['F5']},'BH24')).toBe('B7-D5xF5');expect(formatGameRecord(['B7-D5','--'],'BH24','Human','Computer')).toContain('[Board "BH24"]');});
});
