import { describe, expect, it } from 'vitest';
import { isKellLeaderReady, kellStatusLabel, KELL_LEADER_MIN_RS } from './kellLeader';

describe('isKellLeaderReady', () => {
  it('threshold is RS >= 90 on a 7/7 row', () => {
    expect(KELL_LEADER_MIN_RS).toBe(90);
    expect(isKellLeaderReady(true, 95)).toBe(true);
    expect(isKellLeaderReady(true, 90)).toBe(true);
    expect(isKellLeaderReady(true, 89)).toBe(false);
  });
  it('needs 7/7 and a real RS', () => {
    expect(isKellLeaderReady(false, 99)).toBe(false);
    expect(isKellLeaderReady(true, null)).toBe(false);
    expect(isKellLeaderReady(true, undefined)).toBe(false);
    expect(isKellLeaderReady(true, Number.NaN)).toBe(false);
  });
});

describe('kellStatusLabel', () => {
  const LEADER = '🔥 Leader Ready';
  it('keeps the badge when RS >= 90', () => {
    expect(kellStatusLabel(LEADER, 95)).toEqual({ text: LEADER, leader: true });
    expect(kellStatusLabel(LEADER, 90).leader).toBe(true);
  });
  it('drops the badge below 90 or without RS but still shows 7/7', () => {
    expect(kellStatusLabel(LEADER, 89)).toEqual({ text: 'ผ่าน 7/7', leader: false });
    expect(kellStatusLabel(LEADER, null)).toEqual({ text: 'ผ่าน 7/7', leader: false });
  });
  it('leaves other statuses untouched', () => {
    expect(kellStatusLabel('ชิด EMA', 50)).toEqual({ text: 'ชิด EMA', leader: false });
  });
});
