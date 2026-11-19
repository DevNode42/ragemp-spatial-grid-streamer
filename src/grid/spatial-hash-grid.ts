const EMPTY = -1;

export class FlatSpatialHashGrid {
  private readonly cellSizeInv: number;
  private readonly tableMask: number;
  private readonly buckets: Int32Array;
  private readonly nextNode: Int32Array;
  private readonly prevNode: Int32Array;
  private readonly entityBucket: Int32Array;
  private readonly entityCellX: Int32Array;
  private readonly entityCellY: Int32Array;
  private readonly posX: Float32Array;
  private readonly posY: Float32Array;
  private readonly posZ: Float32Array;

  constructor(maxEntities: number, cellSizeMeters = 100, bucketCountPow2 = 4096) {
    if ((bucketCountPow2 & (bucketCountPow2 - 1)) !== 0) {
      throw new Error('bucketCountPow2 must be power of 2');
    }

    this.cellSizeInv = 1 / cellSizeMeters;
    this.tableMask = bucketCountPow2 - 1;
    this.buckets = new Int32Array(bucketCountPow2).fill(EMPTY);
    this.nextNode = new Int32Array(maxEntities).fill(EMPTY);
    this.prevNode = new Int32Array(maxEntities).fill(EMPTY);
    this.entityBucket = new Int32Array(maxEntities).fill(EMPTY);
    this.entityCellX = new Int32Array(maxEntities);
    this.entityCellY = new Int32Array(maxEntities);
    this.posX = new Float32Array(maxEntities);
    this.posY = new Float32Array(maxEntities);
    this.posZ = new Float32Array(maxEntities);
  }

  private hashCell(cx: number, cy: number): number {
    const h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
    return h & this.tableMask;
  }

  private unlink(entityId: number): void {
    const bucket = this.entityBucket[entityId]!;
    if (bucket === EMPTY) return;

    const prev = this.prevNode[entityId]!;
    const next = this.nextNode[entityId]!;

    if (prev !== EMPTY) {
      this.nextNode[prev] = next;
    } else {
      this.buckets[bucket] = next;
    }

    if (next !== EMPTY) {
      this.prevNode[next] = prev;
    }

    this.prevNode[entityId] = EMPTY;
    this.nextNode[entityId] = EMPTY;
    this.entityBucket[entityId] = EMPTY;
  }

  private link(entityId: number, bucket: number, cx: number, cy: number): void {
    const head = this.buckets[bucket]!;
    this.prevNode[entityId] = EMPTY;
    this.nextNode[entityId] = head;

    if (head !== EMPTY) {
      this.prevNode[head] = entityId;
    }

    this.buckets[bucket] = entityId;
    this.entityBucket[entityId] = bucket;
    this.entityCellX[entityId] = cx;
    this.entityCellY[entityId] = cy;
  }

  upsert(entityId: number, x: number, y: number, z: number): void {
    this.posX[entityId] = x;
    this.posY[entityId] = y;
    this.posZ[entityId] = z;

    const cx = Math.floor(x * this.cellSizeInv);
    const cy = Math.floor(y * this.cellSizeInv);
    const bucket = this.hashCell(cx, cy);

    if (
      this.entityBucket[entityId] === bucket &&
      this.entityCellX[entityId] === cx &&
      this.entityCellY[entityId] === cy
    ) {
      return;
    }

    this.unlink(entityId);
    this.link(entityId, bucket, cx, cy);
  }

  remove(entityId: number): void {
    this.unlink(entityId);
  }

  queryRadius(
    centerX: number,
    centerY: number,
    centerZ: number,
    radiusMeters: number,
    outBuffer: Int32Array
  ): number {
    const rSq = radiusMeters * radiusMeters;
    const minCx = Math.floor((centerX - radiusMeters) * this.cellSizeInv);
    const maxCx = Math.floor((centerX + radiusMeters) * this.cellSizeInv);
    const minCy = Math.floor((centerY - radiusMeters) * this.cellSizeInv);
    const maxCy = Math.floor((centerY + radiusMeters) * this.cellSizeInv);

    let written = 0;
    const maxWrite = outBuffer.length;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        let cursor = this.buckets[this.hashCell(cx, cy)]!;

        while (cursor !== EMPTY) {
          if (this.entityCellX[cursor] === cx && this.entityCellY[cursor] === cy) {
            const dx = this.posX[cursor]! - centerX;
            const dy = this.posY[cursor]! - centerY;
            const dz = this.posZ[cursor]! - centerZ;

            if (dx * dx + dy * dy + dz * dz <= rSq) {
              if (written < maxWrite) {
                outBuffer[written++] = cursor;
              }
            }
          }

          cursor = this.nextNode[cursor]!;
        }
      }
    }

    return written;
  }
}
