import { expect, it } from 'vitest';
import { MatchTimer } from '../src/scenes/matchTimer';

it('tracks real elapsed time, formats minutes, and freezes on game over', () => {
  let now = 1000;
  const timer = new MatchTimer(() => now);
  expect(timer.read(false)).toBe('00:00');
  now += 61999;
  expect(timer.read(false)).toBe('01:01');
  now += 1000;
  expect(timer.read(true)).toBe('01:02');
  now += 60000;
  expect(timer.read(true)).toBe('01:02');
  expect(new MatchTimer(() => now).read(false)).toBe('00:00');
});
