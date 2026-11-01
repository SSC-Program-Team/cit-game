/**
 * A small WebSocket server for node:http, with no packages: the handshake, text frames both ways,
 * ping/pong and close. Enough for one school's game (RFC 6455; no extensions, no binary).
 */
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** a message bigger than this closes the connection: the game never sends one */
const MAX = 256 * 1024;

export type Socket = {
  send(text: string): void;
  close(code?: number): void;
  on(event: 'message', fn: (text: string) => void): void;
  on(event: 'close', fn: () => void): void;
  readonly open: boolean;
  readonly ip: string;
};

export function accept(req: IncomingMessage, sock: Duplex): Socket | null {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || (req.headers.upgrade ?? '').toLowerCase() !== 'websocket') {
    sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const acceptKey = createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);

  const onMessage: Array<(t: string) => void> = [];
  const onClose: Array<() => void> = [];
  let open = true;
  let buf = Buffer.alloc(0);
  let parts: Buffer[] = [];

  const frame = (op: number, payload: Buffer): Buffer => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => {
      const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b;
    })();
    return Buffer.concat([head, payload]);
  };
  const shut = (): void => {
    if (!open) return;
    open = false;
    for (const f of onClose) f();
    sock.destroy();
  };

  sock.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX) { shut(); return; }
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
      if (masked) {
        const m = buf.subarray(off, off + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ m[i & 3]));
      }
      buf = buf.subarray(off + (masked ? 4 : 0) + len);
      if (op === 0x8) { if (open) sock.write(frame(0x8, Buffer.alloc(0))); shut(); return; }
      if (op === 0x9) { sock.write(frame(0xa, payload)); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        parts.push(payload);
        if (parts.reduce((n, p) => n + p.length, 0) > MAX) { shut(); return; }
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          for (const f of onMessage) f(text);
        }
      }
    }
  });
  sock.on('close', shut);
  sock.on('error', shut);
  // keep idle connections alive through proxies
  const ping = setInterval(() => { if (open) sock.write(frame(0x9, Buffer.alloc(0))); else clearInterval(ping); }, 25000);

  const fwd = req.headers['x-forwarded-for'];
  return {
    send(text: string) { if (open) sock.write(frame(0x1, Buffer.from(text, 'utf8'))); },
    close(code = 1000) {
      if (!open) return;
      const b = Buffer.alloc(2); b.writeUInt16BE(code);
      sock.write(frame(0x8, b));
      shut();
    },
    on(event: 'message' | 'close', fn: ((t: string) => void) | (() => void)) {
      if (event === 'message') onMessage.push(fn as (t: string) => void); else onClose.push(fn as () => void);
    },
    get open() { return open; },
    ip: (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket.remoteAddress || '',
  };
}
