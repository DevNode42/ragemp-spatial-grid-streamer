import { performance } from 'node:perf_hooks';
import { FlatSpatialHashGrid } from '../grid/spatial-hash-grid';

interface LinearEntity {
  readonly id: number;
  x: number;
  y: number;
  z: number;
}

const runSpatialBenchmark = (): void => {
  const ENTITY_COUNT = 2_000;
  const STREAM_RADIUS = 150;
  const MAP_EXTENT = 4_000;

  const grid = new FlatSpatialHashGrid(ENTITY_COUNT, 100, 4096);
  const linearWorld: LinearEntity[] = new Array(ENTITY_COUNT);

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const x = ((i * 7919) % (MAP_EXTENT * 2)) - MAP_EXTENT;
    const y = ((i * 6271) % (MAP_EXTENT * 2)) - MAP_EXTENT;
    const z = 25.0;

    grid.upsert(i, x, y, z);
    linearWorld[i] = { id: i, x, y, z };
  }

  const scratchResult = new Int32Array(512);
  let gridTotalFound = 0;

  global.gc?.();
  const memBefore = process.memoryUsage().heapUsed;
  const tGridStart = performance.now();

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const e = linearWorld[i]!;
    gridTotalFound += grid.queryRadius(e.x, e.y, e.z, STREAM_RADIUS, scratchResult);
  }

  const gridMs = performance.now() - tGridStart;
  global.gc?.();
  const memAfter = process.memoryUsage().heapUsed;

  const rSq = STREAM_RADIUS * STREAM_RADIUS;
  let linearTotalFound = 0;
  const tLinearStart = performance.now();

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const a = linearWorld[i]!;
    const found: number[] = [];

    for (let j = 0; j < ENTITY_COUNT; j++) {
      const b = linearWorld[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      if (dx * dx + dy * dy + dz * dz <= rSq) {
        found.push(b.id);
      }
    }

    linearTotalFound += found.length;
  }

  const linearMs = performance.now() - tLinearStart;

  console.log(
    JSON.stringify(
      {
        entities: ENTITY_COUNT,
        streamRadiusMeters: STREAM_RADIUS,
        parityVerified: gridTotalFound === linearTotalFound,
        spatialHashGrid: {
          allPairsQueryMs: Number(gridMs.toFixed(3)),
          heapDeltaKb: Number(((memAfter - memBefore) / 1024).toFixed(2)),
        },
        linearScanBaseline: {
          allPairsQueryMs: Number(linearMs.toFixed(3)),
        },
        speedupFactor: Number((linearMs / gridMs).toFixed(2)),
      },
      null,
      2
    )
  );
};

runSpatialBenchmark();
