// Run with `pnpm --filter @workspace/sub-way-stand test` (Node built-in runner,
// native TS type stripping). Import source files by relative path WITH `.ts`;
// `@/` aliases and React Native imports do not resolve under plain Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swayDirection, lateralAcceleration } from '../lib/physics.ts';

test('left turn pushes the passenger to the right', () => {
  assert.equal(swayDirection(lateralAcceleration(12, 1 / 400)), 'right');
});
