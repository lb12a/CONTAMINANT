// Range bands and area shapes from section 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burst, clockRing, clockTile, cone, distance, line, neighbors, ring, star, toPixel, coneWedgeToward, fromPixel, CENTER } from '../src/index.ts';

const c = { c: 7, r: 4 };

test('shape tile counts match the shape table', () => {
  assert.equal(ring(c, 1).length, 6, 'Ring-1');
  assert.equal(burst(c, 1).length, 7, 'Burst-1');
  assert.equal(ring(c, 2).length, 12, 'Ring-2 / Clock Ring');
  assert.equal(burst(c, 2).length, 19, 'Burst-2');
  assert.equal(burst(c, 3).length, 37, 'Burst-3');
  assert.equal(cone(c, 0, 3).length, 9, 'Cone-3 (rows of 2, 3, 4)');
  assert.equal(star(c, 2).length, 13, 'Star-2');
});

test('cone rows are 2, 3, 4 tiles at distances 1, 2, 3', () => {
  for (let w = 0; w < 6; w++) {
    const tiles = cone(c, w, 3);
    const byDist = [1, 2, 3].map((d) => tiles.filter((h) => distance(c, h) === d).length);
    assert.deepEqual(byDist, [2, 3, 4]);
  }
});

test('the Control Field sits at column 8, row 5 (1-based)', () => {
  assert.deepEqual(CENTER, { c: 7, r: 4 });
});

test('distances and neighbours on the odd-r pointy-top grid', () => {
  for (const n of neighbors(c)) assert.equal(distance(c, n), 1);
  assert.equal(distance({ c: 0, r: 0 }, { c: 14, r: 8 }), 18);
  assert.equal(line({ c: 0, r: 4 }, { c: 6, r: 4 }).length, 7);
});

test('Clock Ring: 12 at the top, numbered clockwise, minute hand opposite', () => {
  const tiles = clockRing(c);
  assert.equal(tiles.length, 12);
  const p = (h: { c: number; r: number }) => toPixel(h, 1);
  const centre = p(c);
  const twelve = p(clockTile(c, 12));
  assert.ok(Math.abs(twelve.x - centre.x) < 1e-6 && twelve.y < centre.y, '12 is straight up');
  const six = p(clockTile(c, 6));
  assert.ok(Math.abs(six.x - centre.x) < 1e-6 && six.y > centre.y, '6 is straight down');
  const three = p(clockTile(c, 3));
  assert.ok(three.x > centre.x && Math.abs(three.y - centre.y) < 1e-6, '3 is to the right');
  for (const t of tiles) assert.equal(distance(c, t.tile), 2);
  // round 13 counts as 1
  assert.deepEqual(clockTile(c, 13), clockTile(c, 1));
  // opposite = +6
  for (let h = 1; h <= 12; h++) {
    const a = p(clockTile(c, h));
    const b = p(clockTile(c, h + 6));
    assert.ok(Math.abs(a.x - centre.x + (b.x - centre.x)) < 1e-6 && Math.abs(a.y - centre.y + (b.y - centre.y)) < 1e-6);
  }
});

test('cone wedge selection points toward the target', () => {
  const w = coneWedgeToward(c, { c: 10, r: 4 });
  assert.ok(cone(c, w, 3).some((h) => h.c === 10 && h.r === 4));
});

test('pixel round trip', () => {
  for (const h of [c, { c: 0, r: 0 }, { c: 14, r: 8 }, { c: 3, r: 5 }]) {
    const px = toPixel(h, 32);
    assert.deepEqual(fromPixel(px.x, px.y, 32), h);
  }
});
