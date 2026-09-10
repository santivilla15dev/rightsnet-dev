import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import {
  memoryRateLimitPort,
  redisRateLimitPort,
  setRateLimitPortForTests,
} from '../apps/api/src/common/rate-limit.js';
import { config } from '../apps/api/src/common/config.js';

afterEach(() => setRateLimitPortForTests(null));

describe('Rate limit distributed v0.1', () => {
  it('memory: permite hasta el límite y luego niega en la misma ventana', async () => {
    const port = memoryRateLimitPort();
    const key = 't:' + Math.random();
    for (let i = 1; i <= 3; i++) {
      const r = await port.hit(key, 3, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
    }
    const blocked = await port.hit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(4);
  });

  it('redis: INCR/EXPIRE vía mock RESP y bloquea al superar límite', async () => {
    const counters = new Map<string, number>();
    const server = createServer((socket: Socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (true) {
          const text = buf.toString('utf8');
          if (!text.includes('\r\n')) return;
          // Minimal: count args then consume bulk strings
          if (!text.startsWith('*')) return;
          const lines = text.split('\r\n');
          const n = Number(lines[0]!.slice(1));
          const args: string[] = [];
          let i = 1;
          for (let a = 0; a < n; a++) {
            if (!lines[i]?.startsWith('$')) return;
            const len = Number(lines[i]!.slice(1));
            const val = lines[i + 1] ?? '';
            if (val.length < len && !text.endsWith('\r\n')) return;
            args.push(val);
            i += 2;
          }
          const consumed = lines.slice(0, i).join('\r\n').length + 2;
          buf = buf.subarray(Math.min(consumed, buf.length));
          const cmd = (args[0] ?? '').toUpperCase();
          if (cmd === 'INCR') {
            const k = args[1]!;
            const next = (counters.get(k) ?? 0) + 1;
            counters.set(k, next);
            socket.write(`:${next}\r\n`);
          } else if (cmd === 'EXPIRE') {
            socket.write(':1\r\n');
          } else {
            socket.write('-ERR unknown\r\n');
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    try {
      const port = redisRateLimitPort({
        url: `redis://127.0.0.1:${addr.port}`,
        keyPrefix: 'test:',
      });
      const key = 'api:' + Math.random();
      expect((await port.hit(key, 2, 60_000)).allowed).toBe(true);
      expect((await port.hit(key, 2, 60_000)).allowed).toBe(true);
      expect((await port.hit(key, 2, 60_000)).allowed).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it('default CI es memory', () => {
    expect(config.rateLimitProvider).toBe('memory');
  });
});
