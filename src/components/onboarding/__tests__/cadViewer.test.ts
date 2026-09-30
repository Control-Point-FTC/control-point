/** CAD 3D viewer: verifies occt STEP output converts to a valid three.js geometry. */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { meshFromOcct } from '../../CadModelViewer';

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('meshFromOcct (real STEP parse)', () => {
  it('converts occt-import-js output into a renderable BufferGeometry', async () => {
    const occtimportjs = require(join(repoRoot, 'node_modules', 'occt-import-js', 'dist', 'occt-import-js.js'));
    const occt = await occtimportjs();
    const stp = readFileSync(join(repoRoot, 'node_modules', 'occt-import-js', 'test', 'testfiles', 'simple-basic-cube', 'cube.stp'));
    const result = occt.ReadStepFile(new Uint8Array(stp), null);
    expect(result.success).toBe(true);
    expect(result.meshes.length).toBeGreaterThan(0);

    const geo: any = meshFromOcct(result.meshes[0]);
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    expect(pos.count).toBeGreaterThan(0);
    expect(pos.itemSize).toBe(3);
    expect(idx).not.toBeNull();
    expect(idx!.count % 3).toBe(0);
    // every index references a real vertex
    let maxIdx = 0;
    for (let i = 0; i < idx!.count; i++) maxIdx = Math.max(maxIdx, idx!.getX(i));
    expect(maxIdx).toBeLessThan(pos.count);
    geo.dispose?.();
  }, 60000);
});
