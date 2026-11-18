/**
 * Minimal streaming ZIP writer (stored, no compression — images are already compressed).
 * Entries are written sequentially to a sink, so a large frame export can stream to OPFS.
 * ZIP64 is not implemented: archives are limited to 4 GB and 65,535 entries.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

export interface ZipSink {
  write(chunk: Uint8Array): Promise<void>;
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export class ZipWriter {
  private offset = 0;
  private readonly central: Uint8Array[] = [];
  private count = 0;
  private readonly stamp = dosTime(new Date());

  constructor(private readonly sink: ZipSink) {}

  get size(): number {
    return this.offset;
  }

  async add(name: string, data: Uint8Array): Promise<void> {
    if (this.count >= 65535) throw new Error('Too many files for one ZIP archive.');
    if (this.offset + data.length > 0xfffffff0) throw new Error('The archive would exceed 4 GB.');
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // UTF-8 names
    h.setUint16(8, 0, true); // stored
    h.setUint16(10, this.stamp.time, true);
    h.setUint16(12, this.stamp.date, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, this.stamp.time, true);
    c.setUint16(14, this.stamp.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, this.offset, true);
    cd.set(nameBytes, 46);
    this.central.push(cd);

    await this.sink.write(header);
    await this.sink.write(data);
    this.offset += header.length + data.length;
    this.count++;
  }

  async finish(): Promise<void> {
    const start = this.offset;
    let size = 0;
    for (const cd of this.central) {
      await this.sink.write(cd);
      size += cd.length;
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, this.count, true);
    e.setUint16(10, this.count, true);
    e.setUint32(12, size, true);
    e.setUint32(16, start, true);
    await this.sink.write(end);
    this.offset += size + 22;
  }
}

/** Read back a stored ZIP's entry names and verify CRCs (used to validate our own archives). */
export function readStoredZip(buf: Uint8Array): { name: string; size: number; crcOk: boolean }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: { name: string; size: number; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt central directory.');
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lName = v.getUint16(local + 26, true);
    const lExtra = v.getUint16(local + 28, true);
    const dataStart = local + 30 + lName + lExtra;
    out.push({ name, size, crcOk: crc32(buf.subarray(dataStart, dataStart + size)) === crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
