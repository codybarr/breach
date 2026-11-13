import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { opensOnTouch } from '../src/render/stage';

function target(userData: Record<string, unknown>) {
  const o = new THREE.Object3D();
  Object.assign(o.userData, userData);
  return o;
}

describe('touching a card', () => {
  it('opens a card that can be inspected', () => {
    expect(opensOnTouch(target({ preview: 'megabyte' }))).toBe(true);
  });

  // The inspector covers half the hand, so opening it mid-prompt hid the other picks
  // behind its CONFIRM button (Load Balancer could only discard one).
  it('leaves the hand uncovered while picking cards for a prompt', () => {
    expect(opensOnTouch(target({ preview: 'megabyte', oneTap: true }))).toBe(false);
  });

  it('ignores buttons and empty space', () => {
    expect(opensOnTouch(target({}))).toBe(false);
    expect(opensOnTouch(null)).toBe(false);
  });
});
