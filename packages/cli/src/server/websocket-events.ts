import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";

import {
  LOCAL_API_VERSION,
  type JsonObject,
  type LocalSessionEvent,
} from "@skillpin/core";

interface WebSocketPeerOptions {
  readonly onClosed: (peer: WebSocketPeer) => void;
  readonly onPong: () => void;
}

const MAX_FRAME_BYTES = 64 * 1024;

function frame(opcode: number, payload: Buffer): Buffer {
  const headerLength = payload.byteLength < 126 ? 2 : 4;
  const header = Buffer.allocUnsafe(headerLength);
  header[0] = 0x80 | opcode;
  if (payload.byteLength < 126) {
    header[1] = payload.byteLength;
  } else {
    header[1] = 126;
    header.writeUInt16BE(payload.byteLength, 2);
  }
  return Buffer.concat([header, payload]);
}

/** Minimal server-side RFC 6455 peer: control frames and text event delivery only. */
export class WebSocketPeer {
  readonly #socket: Duplex;
  readonly #options: WebSocketPeerOptions;
  #buffer = Buffer.alloc(0);
  #closed = false;

  public constructor(socket: Duplex, options: WebSocketPeerOptions) {
    this.#socket = socket;
    this.#options = options;
    socket.on("data", (chunk: Buffer) => this.consume(chunk));
    socket.on("close", () => this.finish());
    socket.on("error", () => this.finish());
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public close(): void {
    if (!this.#closed) {
      this.#socket.write(frame(0x8, Buffer.alloc(0)));
      this.#socket.end();
      this.finish();
    }
  }

  public ping(): void {
    if (!this.#closed) {
      this.#socket.write(frame(0x9, Buffer.from("skillpin")));
    }
  }

  public sendEvent(event: LocalSessionEvent): void {
    if (!this.#closed) {
      this.#socket.write(frame(0x1, Buffer.from(JSON.stringify(event))));
    }
  }

  private consume(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    while (this.#buffer.byteLength >= 2 && !this.#closed) {
      const first = this.#buffer[0];
      const second = this.#buffer[1];
      if (first === undefined || second === undefined) {
        return;
      }
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let headerLength = 2;
      let payloadLength = second & 0x7f;
      if (payloadLength === 126) {
        if (this.#buffer.byteLength < 4) {
          return;
        }
        payloadLength = this.#buffer.readUInt16BE(2);
        headerLength = 4;
      } else if (payloadLength === 127) {
        this.close();
        return;
      }
      if (!masked || payloadLength > MAX_FRAME_BYTES) {
        this.close();
        return;
      }
      const requiredLength = headerLength + 4 + payloadLength;
      if (this.#buffer.byteLength < requiredLength) {
        return;
      }
      const mask = this.#buffer.subarray(headerLength, headerLength + 4);
      const payload = Buffer.from(
        this.#buffer.subarray(headerLength + 4, requiredLength),
      );
      for (let index = 0; index < payload.byteLength; index += 1) {
        const maskByte = mask[index % 4];
        const payloadByte = payload[index];
        if (maskByte !== undefined && payloadByte !== undefined) {
          payload[index] = payloadByte ^ maskByte;
        }
      }
      this.#buffer = this.#buffer.subarray(requiredLength);
      if (opcode === 0x8) {
        this.close();
      } else if (opcode === 0x9) {
        this.#socket.write(frame(0xa, payload));
      } else if (opcode === 0xa) {
        this.#options.onPong();
      } else if (opcode !== 0x1) {
        this.close();
      }
    }
  }

  private finish(): void {
    if (!this.#closed) {
      this.#closed = true;
      this.#options.onClosed(this);
    }
  }
}

export interface WebSocketEventHubOptions {
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly onClientCountChanged: (count: number) => void;
  readonly sessionId: string;
}

interface ConnectedPeer {
  readonly peer: WebSocketPeer;
  lastPongAt: number;
}

/** Owns authenticated page connections and a single strictly increasing event stream. */
export class WebSocketEventHub {
  readonly #clients = new Map<WebSocketPeer, ConnectedPeer>();
  readonly #options: WebSocketEventHubOptions;
  readonly #heartbeat: NodeJS.Timeout;
  #sequence = 0;

  public constructor(options: WebSocketEventHubOptions) {
    this.#options = options;
    this.#heartbeat = setInterval(
      () => this.heartbeat(),
      options.heartbeatIntervalMs,
    );
    this.#heartbeat.unref();
  }

  public get clientCount(): number {
    return this.#clients.size;
  }

  public accept(socket: Duplex): void {
    const peer = new WebSocketPeer(socket, {
      onClosed: () => this.remove(peer),
      onPong: () => {
        const client = this.#clients.get(peer);
        if (client !== undefined) {
          client.lastPongAt = Date.now();
        }
      },
    });
    this.#clients.set(peer, { lastPongAt: Date.now(), peer });
    this.#options.onClientCountChanged(this.clientCount);
    this.broadcast("session.client-count", { clientCount: this.clientCount });
  }

  public broadcast(type: string, data: JsonObject): LocalSessionEvent {
    this.#sequence += 1;
    const event: LocalSessionEvent = {
      data,
      sequence: this.#sequence,
      sessionId: this.#options.sessionId,
      type,
      version: LOCAL_API_VERSION,
    };
    for (const client of this.#clients.values()) {
      client.peer.sendEvent(event);
    }
    return event;
  }

  public close(): void {
    clearInterval(this.#heartbeat);
    for (const client of [...this.#clients.values()]) {
      client.peer.close();
    }
    this.#clients.clear();
  }

  private heartbeat(): void {
    const now = Date.now();
    for (const client of [...this.#clients.values()]) {
      if (now - client.lastPongAt > this.#options.heartbeatTimeoutMs) {
        client.peer.close();
      } else {
        client.peer.ping();
      }
    }
  }

  private remove(peer: WebSocketPeer): void {
    if (this.#clients.delete(peer)) {
      this.#options.onClientCountChanged(this.clientCount);
      this.broadcast("session.client-count", { clientCount: this.clientCount });
    }
  }
}

export function createWebSocketAccept(key: string): string {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}
