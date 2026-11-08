import { describe, expect, it } from 'vitest';
import { describeValidation, validateTDAN } from './validator';

describe('TDAN replay validation', () => {
  it('reports the first illegal consecutive movement in the recorded game', () => {
    const record = `1. A4-A3       B1-B4
2. E4-E3       D1-D4
3. B5-C5       B4-B5
4. E3-D3xD4 [D4@B1]       B5-B4`;
    const result = validateTDAN(record);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.move).toBe(4);
      expect(result.side).toBe('black');
      expect(result.notation).toBe('B5-B4');
      expect(describeValidation(result)).toContain('already moved on this player');
    }
  });
  it('validates records on the board named in their header',()=>{
    const result=validateTDAN('[Game "Claustra Strategy"]\n[Board "BH24"]\n\n1. B1-E1 H7-E7');
    expect(result.valid).toBe(true);if(result.valid)expect(result.state.boardId).toBe('BH24');
  });
});
