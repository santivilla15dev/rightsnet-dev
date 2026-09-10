import net from 'node:net';
import { config } from './config.js';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
};

export type RateLimitPort = {
  hit: (key: string, limit: number, windowMs: number) => Promise<RateLimitResult>;
};

let testPort: RateLimitPort | null = null;

export function setRateLimitPortForTests(port: RateLimitPort | null) {
  testPort = port;
}

/** In-process fixed window (current production default / CI). */
export function memoryRateLimitPort(): RateLimitPort {
  const buckets = new Map<string, { count: number; until: number }>();
  return {
    hit: async (key, limit, windowMs) => {
      const now = Date.now();
      const cur = buckets.get(key);
      if (cur && cur.until > now) {
        cur.count++;
        if (buckets.size > 10000) {
          for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
        }
        return {
          allowed: cur.count <= limit,
          count: cur.count,
          remaining: Math.max(0, limit - cur.count),
        };
      }
      buckets.set(key, { count: 1, until: now + windowMs });
      return { allowed: true, count: 1, remaining: limit - 1 };
    },
  };
}

function encodeRedis(args: string[]): Buffer {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const b = Buffer.from(a, 'utf8');
    out += `$${b.length}\r\n${a}\r\n`;
  }
  return Buffer.from(out, 'utf8');
}

function parseRedisReply(buf: Buffer): { value: string | number; rest: Buffer } {
  const text = buf.toString('utf8');
  if (text.startsWith('+')) {
    const end = text.indexOf('\r\n');
    return { value: text.slice(1, end), rest: Buffer.from(text.slice(end + 2), 'utf8') };
  }
  if (text.startsWith(':')) {
    const end = text.indexOf('\r\n');
    return { value: Number(text.slice(1, end)), rest: Buffer.from(text.slice(end + 2), 'utf8') };
  }
  if (text.startsWith('-')) {
    const end = text.indexOf('\r\n');
    throw new Error(`REDIS_ERROR ${text.slice(1, end)}`);
  }
  if (text.startsWith('$')) {
    const nl = text.indexOf('\r\n');
    const len = Number(text.slice(1, nl));
    if (len < 0) return { value: '', rest: Buffer.from(text.slice(nl + 2), 'utf8') };
    const start = nl + 2;
    const end = start + len;
    return {
      value: text.slice(start, end),
      rest: Buffer.from(text.slice(end + 2), 'utf8'),
    };
  }
  throw new Error('REDIS_UNPARSED');
}

export type RedisRateLimitConfig = {
  url: string;
  /** Injected connect for tests. */
  connect?: (host: string, port: number) => Promise<net.Socket>;
  keyPrefix?: string;
};

function defaultConnect(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => resolve(socket));
    socket.once('error', reject);
  });
}

async function redisCommand(
  socket: net.Socket,
  args: string[],
  timeoutMs = 3000,
): Promise<string | number> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('REDIS_TIMEOUT'));
    }, timeoutMs);
    const onData = (c: Buffer) => {
      chunks.push(c);
      try {
        const { value } = parseRedisReply(Buffer.concat(chunks));
        cleanup();
        resolve(value);
      } catch {
        // wait for more bytes
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onErr);
    };
    socket.on('data', onData);
    socket.on('error', onErr);
    socket.write(encodeRedis(args));
  });
}

/**
 * Fixed-window counter in Redis: INCR key; if first hit, EXPIRE window.
 * Fail-open on connection errors (log + allow) so Redis outage ≠ total outage.
 */
export function redisRateLimitPort(cfg: RedisRateLimitConfig): RateLimitPort {
  const u = new URL(cfg.url);
  const host = u.hostname || '127.0.0.1';
  const port = Number(u.port || 6379);
  const prefix = cfg.keyPrefix ?? 'rn:rl:';
  const connect = cfg.connect ?? defaultConnect;

  return {
    hit: async (key, limit, windowMs) => {
      let socket: net.Socket | null = null;
      try {
        socket = await connect(host, port);
        const rkey = prefix + key;
        const count = Number(await redisCommand(socket, ['INCR', rkey]));
        if (count === 1) {
          const sec = Math.max(1, Math.ceil(windowMs / 1000));
          await redisCommand(socket, ['EXPIRE', rkey, String(sec)]);
        }
        return {
          allowed: count <= limit,
          count,
          remaining: Math.max(0, limit - count),
        };
      } catch (err) {
        console.warn('rate_limit redis unavailable; fail-open', err);
        return { allowed: true, count: 0, remaining: limit };
      } finally {
        socket?.destroy();
      }
    },
  };
}

export function rateLimitPort(): RateLimitPort {
  if (testPort) return testPort;
  if (config.rateLimitProvider === 'redis') {
    const url = process.env.REDIS_URL ?? '';
    if (!url) throw new Error('RATE_LIMIT_PROVIDER=redis requires REDIS_URL');
    return redisRateLimitPort({ url });
  }
  return memoryRateLimitPort();
}
