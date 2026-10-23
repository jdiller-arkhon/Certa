/**
 * The MQTT side of the live relay: just enough of MQTT 3.1.1 (over WebSocket) for DJI Pilot 2
 * and DJI Dock to connect, publish their state and receive replies. Nothing here depends on
 * Cloudflare, so it runs the same in the Durable Object and in tests.
 *
 * There is no broker between devices: each connection only talks to Certa. Messages a device
 * publishes go to Certa's API in small batches; replies come back to that device only.
 */

export interface RelayMessage {
  topic: string;
  payload: string;
}

export interface RelayIO {
  send(bytes: Uint8Array): void;
  close(): void;
  /** Checks the controller's credential with Certa. Throws if Certa can't be reached. */
  auth(username: string, password: string): Promise<boolean>;
  /** Hands messages to Certa; returns replies for this device and whether to hang up. */
  forward(username: string, messages: RelayMessage[]): Promise<{ publish: RelayMessage[]; disconnect: boolean }>;
  log(event: string, fields?: Record<string, unknown>): void;
}

/** What survives a Durable Object hibernating between messages. */
export interface RelayState {
  username: string | null;
  subscriptions: string[];
}

const MAX_PACKET = 256 * 1024;
/** Aircraft state arrives about once a second per device; it's sent to Certa at most this often. */
const FLUSH_MS = 1000;
const MAX_BATCH = 100;

const enc = new TextEncoder();
const dec = new TextDecoder();

// ------------------------------------------------------------------ encoding

function remainingLength(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function packet(header: number, body: number[] | Uint8Array): Uint8Array {
  const len = remainingLength(body.length);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = header;
  out.set(len, 1);
  out.set(body, 1 + len.length);
  return out;
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const str = (s: string) => {
  const b = enc.encode(s);
  return [...u16(b.length), ...b];
};

export const connack = (code: number) => packet(0x20, [0, code]);
export const puback = (id: number) => packet(0x40, u16(id));
const pubrec = (id: number) => packet(0x50, u16(id));
const pubcomp = (id: number) => packet(0x70, u16(id));
const suback = (id: number, codes: number[]) => packet(0x90, [...u16(id), ...codes]);
const unsuback = (id: number) => packet(0xb0, u16(id));
const pingresp = () => packet(0xd0, []);
/** QoS 0 publish to the device. */
export const publishPacket = (topic: string, payload: string) => packet(0x30, [...str(topic), ...enc.encode(payload)]);

// ------------------------------------------------------------------ decoding

export interface Packet {
  type: number;
  flags: number;
  body: Uint8Array;
}

/** Splits a byte stream into packets; returns the packets and any incomplete tail. */
export function splitPackets(buf: Uint8Array): { packets: Packet[]; rest: Uint8Array } {
  const packets: Packet[] = [];
  let i = 0;
  while (i + 2 <= buf.length) {
    let mult = 1;
    let len = 0;
    let j = i + 1;
    let done = false;
    for (; j < buf.length && j < i + 5; j++) {
      len += (buf[j]! & 0x7f) * mult;
      mult *= 128;
      if (!(buf[j]! & 0x80)) {
        done = true;
        j++;
        break;
      }
    }
    if (!done) {
      if (j >= i + 5) throw new Error('malformed length');
      break;
    }
    if (len > MAX_PACKET) throw new Error('packet too large');
    if (j + len > buf.length) break;
    packets.push({ type: buf[i]! >> 4, flags: buf[i]! & 0x0f, body: buf.subarray(j, j + len) });
    i = j + len;
  }
  return { packets, rest: buf.slice(i) };
}

class Reader {
  i = 0;
  constructor(private b: Uint8Array) {}
  u8() {
    if (this.i >= this.b.length) throw new Error('short packet');
    return this.b[this.i++]!;
  }
  u16() {
    return (this.u8() << 8) | this.u8();
  }
  bytes(n: number) {
    if (this.i + n > this.b.length) throw new Error('short packet');
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
  str() {
    return dec.decode(this.bytes(this.u16()));
  }
  rest() {
    return this.b.subarray(this.i);
  }
  get left() {
    return this.b.length - this.i;
  }
}

/** MQTT topic filter match (+ one level, # the rest). */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

// ------------------------------------------------------------------ session

export class RelaySession {
  private buf: Uint8Array = new Uint8Array(0);
  private queue: RelayMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Certa calls run one at a time so messages keep their order. */
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;
  /** Packets that arrive while CONNECT is being checked wait here. */
  private waiting: Packet[] | null = null;

  constructor(
    private io: RelayIO,
    public state: RelayState = { username: null, subscriptions: [] },
    private onState: (s: RelayState) => void = () => {},
  ) {}

  onData(data: Uint8Array) {
    if (this.closed) return;
    const joined = new Uint8Array(this.buf.length + data.length);
    joined.set(this.buf);
    joined.set(data, this.buf.length);
    try {
      const { packets, rest } = splitPackets(joined);
      this.buf = rest;
      for (const p of packets) this.handle(p);
    } catch (err) {
      this.io.log('relay_bad_packet', { error: (err as Error).message });
      this.close();
    }
  }

  /** The socket closed: send what's queued. */
  async onClose() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flush();
  }

  private close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.io.close();
  }

  private handle(p: Packet) {
    if (this.waiting) return void this.waiting.push(p);
    if (!this.state.username && p.type !== 1) return this.close();
    switch (p.type) {
      case 1:
        this.waiting = [];
        return void this.connect(p.body).finally(() => {
          const held = this.waiting ?? [];
          this.waiting = null;
          for (const q of held) if (!this.closed) this.handle(q);
        });
      case 3:
        return this.publish(p.flags, p.body);
      case 6: // PUBREL (QoS 2, second half)
        return this.io.send(pubcomp(new Reader(p.body).u16()));
      case 8:
        return this.subscribe(p.body);
      case 10: {
        const r = new Reader(p.body);
        const id = r.u16();
        const gone = new Set<string>();
        while (r.left) gone.add(r.str());
        this.setState({ ...this.state, subscriptions: this.state.subscriptions.filter((s) => !gone.has(s)) });
        return this.io.send(unsuback(id));
      }
      case 12:
        return this.io.send(pingresp());
      case 14:
        return this.close();
      default:
        return; // PUBACK etc. for messages we send at QoS 0 never arrive; ignore anything else
    }
  }

  private async connect(body: Uint8Array) {
    if (this.state.username) return this.close(); // a second CONNECT is a protocol error
    const r = new Reader(body);
    const name = r.str();
    const level = r.u8();
    if (!((name === 'MQTT' && level === 4) || (name === 'MQIsdp' && level === 3))) {
      this.io.send(connack(1)); // unacceptable protocol version
      return this.close();
    }
    const flags = r.u8();
    r.u16(); // keep-alive: the device pings, we answer
    r.str(); // client id
    if (flags & 0x04) {
      r.str(); // will topic
      r.bytes(r.u16()); // will message
    }
    const username = flags & 0x80 ? r.str() : '';
    const password = flags & 0x40 ? dec.decode(r.bytes(r.u16())) : '';
    let ok: boolean;
    try {
      ok = !!username && !!password && (await this.io.auth(username, password));
    } catch (err) {
      this.io.log('relay_auth_unavailable', { error: (err as Error).message });
      this.io.send(connack(3)); // server unavailable: the device retries
      return this.close();
    }
    if (!ok) {
      this.io.log('relay_auth_denied', { username: username.slice(0, 20) });
      this.io.send(connack(5)); // not authorized
      return this.close();
    }
    this.setState({ username, subscriptions: [] });
    this.io.log('relay_connected', { username });
    this.io.send(connack(0));
  }

  private publish(flags: number, body: Uint8Array) {
    const qos = (flags >> 1) & 3;
    const r = new Reader(body);
    const topic = r.str();
    const id = qos > 0 ? r.u16() : 0;
    const payload = dec.decode(r.rest());
    if (qos === 1) this.io.send(puback(id));
    if (qos === 2) this.io.send(pubrec(id));
    this.queue.push({ topic, payload });
    // Topology and events want a prompt answer; aircraft state can wait for the next batch.
    if (!topic.endsWith('/osd') || this.queue.length >= MAX_BATCH) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
  }

  private subscribe(body: Uint8Array) {
    const r = new Reader(body);
    const id = r.u16();
    const subs = new Set(this.state.subscriptions);
    const codes: number[] = [];
    while (r.left) {
      const filter = r.str();
      r.u8(); // requested QoS; replies go out at QoS 0
      // Only replies to this device's own messages are ever sent, whatever it subscribes to.
      subs.add(filter);
      codes.push(0);
    }
    this.setState({ ...this.state, subscriptions: [...subs] });
    this.io.send(suback(id, codes));
  }

  private flush(): Promise<unknown> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.queue.length || !this.state.username) return this.chain;
    const batch = this.queue.splice(0, this.queue.length);
    const username = this.state.username;
    this.chain = this.chain.then(async () => {
      try {
        const res = await this.io.forward(username, batch);
        if (res.disconnect) {
          this.io.log('relay_credential_revoked', { username });
          return this.close();
        }
        for (const m of res.publish) {
          if (!this.closed && this.state.subscriptions.some((f) => topicMatches(f, m.topic))) this.io.send(publishPacket(m.topic, m.payload));
        }
      } catch (err) {
        // Certa is starting or unreachable: this batch is lost, the flight carries on with the next.
        this.io.log('relay_forward_failed', { error: (err as Error).message, messages: batch.length });
      }
    });
    return this.chain;
  }

  private setState(s: RelayState) {
    this.state = s;
    this.onState(s);
  }
}
