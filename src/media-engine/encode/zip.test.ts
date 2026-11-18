import { describe, expect, it } from 'vitest';
import { crc32, readStoredZip, ZipWriter } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a stored archive that reads back with valid checksums', async () => {
    const parts: Uint8Array[] = [];
    const zip = new ZipWriter({ write: async (c) => void parts.push(c) });
    await zip.add('a.txt', new TextEncoder().encode('hello'));
    await zip.add('folder/ü.bin', new Uint8Array([0, 1, 2, 3, 255]));
    await zip.finish();
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    expect(zip.size).toBe(total);
    const entries = readStoredZip(buf);
    expect(entries).toEqual([
      { name: 'a.txt', size: 5, crcOk: true },
      { name: 'folder/ü.bin', size: 5, crcOk: true },
    ]);
  });
});
