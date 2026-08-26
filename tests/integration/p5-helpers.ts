import { randomBytes } from "node:crypto";
import { request as nodeRequest } from "node:http";
import { connect } from "node:net";

export interface HttpResult {
  readonly body: string;
  readonly headers: import("node:http").IncomingHttpHeaders;
  readonly status: number;
}

export function requestLocal(
  base: string,
  path: string,
  options: {
    readonly body?: string;
    readonly headers?: Record<string, string>;
    readonly method?: string;
  } = {},
): Promise<HttpResult> {
  const url = new URL(path, base);
  const headers = {
    ...(options.body === undefined
      ? {}
      : { "Content-Length": String(Buffer.byteLength(options.body)) }),
    ...options.headers,
  };
  return new Promise((resolve, reject) => {
    const request = nodeRequest(
      {
        headers,
        host: url.hostname,
        method: options.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        port: Number(url.port),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode ?? 0,
          });
        });
      },
    );
    request.once("error", reject);
    request.end(options.body);
  });
}

interface ServerFrame {
  readonly opcode: number;
  readonly payload: Buffer;
}

function readServerFrames(buffer: Buffer): {
  frames: ServerFrame[];
  rest: Buffer;
} {
  const frames: ServerFrame[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.byteLength) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    if (first === undefined || second === undefined) {
      break;
    }
    let headerLength = 2;
    let length = second & 0x7f;
    if (length === 126) {
      if (offset + 4 > buffer.byteLength) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    }
    if (
      length === 127 ||
      (second & 0x80) !== 0 ||
      offset + headerLength + length > buffer.byteLength
    ) {
      break;
    }
    frames.push({
      opcode: first & 0x0f,
      payload: buffer.subarray(
        offset + headerLength,
        offset + headerLength + length,
      ),
    });
    offset += headerLength + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function clientFrame(opcode: number, payload = Buffer.alloc(0)): Buffer {
  const mask = randomBytes(4);
  const header = Buffer.alloc(payload.byteLength < 126 ? 6 : 8);
  header[0] = 0x80 | opcode;
  if (payload.byteLength < 126) {
    header[1] = 0x80 | payload.byteLength;
    mask.copy(header, 2);
  } else {
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.byteLength, 2);
    mask.copy(header, 4);
  }
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.byteLength; index += 1) {
    const maskByte = mask[index % 4];
    const byte = masked[index];
    if (maskByte !== undefined && byte !== undefined) {
      masked[index] = byte ^ maskByte;
    }
  }
  return Buffer.concat([header, masked]);
}

export interface TestWebSocket {
  readonly messages: unknown[];
  readonly status: number;
  close(): void;
  waitForMessages(count: number): Promise<readonly unknown[]>;
}

export function openWebSocket(
  base: string,
  credential: string | undefined,
  origin: string,
  options: {
    readonly includeSessionProtocol?: boolean;
    readonly version?: string;
  } = {},
): Promise<TestWebSocket> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) });
    let buffer = Buffer.alloc(0);
    let handshaken = false;
    let status = 0;
    const messages: unknown[] = [];
    const waiters: (() => void)[] = [];
    const finishWaiters = () => {
      for (const waiter of waiters.splice(0)) {
        waiter();
      }
    };
    const testSocket: TestWebSocket = {
      close: () => socket.write(clientFrame(0x8)),
      messages,
      get status() {
        return status;
      },
      waitForMessages: async (count) => {
        if (messages.length >= count) {
          return messages;
        }
        await new Promise<void>((resolveWaiter) => waiters.push(resolveWaiter));
        return testSocket.waitForMessages(count);
      },
    };
    socket.once("error", reject);
    socket.once("connect", () => {
      const protocols =
        options.includeSessionProtocol === false ? [] : ["skillpin.v1"];
      if (credential !== undefined) {
        protocols.push(`skillpin.credential.${credential}`);
      }
      socket.write(
        [
          "GET /api/session/events HTTP/1.1",
          `Host: ${url.host}`,
          `Origin: ${origin}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
          `Sec-WebSocket-Version: ${options.version ?? "13"}`,
          ...(protocols.length === 0
            ? []
            : [`Sec-WebSocket-Protocol: ${protocols.join(", ")}`]),
          "\r\n",
        ].join("\r\n"),
      );
    });
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshaken) {
        const split = buffer.indexOf("\r\n\r\n");
        if (split < 0) {
          return;
        }
        const headers = buffer.subarray(0, split).toString("utf8");
        status = Number(headers.split(" ")[1] ?? 0);
        handshaken = true;
        buffer = buffer.subarray(split + 4);
        if (status !== 101) {
          socket.end();
          resolve(testSocket);
          return;
        }
        resolve(testSocket);
      }
      const parsed = readServerFrames(buffer);
      buffer = parsed.rest;
      for (const frame of parsed.frames) {
        if (frame.opcode === 0x9) {
          socket.write(clientFrame(0xa, frame.payload));
        } else if (frame.opcode === 0x1) {
          messages.push(JSON.parse(frame.payload.toString("utf8")));
          finishWaiters();
        }
      }
    });
  });
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
