/**
 * DJI Cloud API bridge: subscribes to the MQTT message server that linked DJI Pilot 2
 * controllers and docks publish to, answers topology updates as DJI requires, and feeds aircraft
 * state into the live processor. Runs in the worker when LIVE_MQTT_URL is set.
 */
import { djiHealthEvents, djiOsdToFrame, djiStatusReply, djiTopology, parseDjiTopic } from '@certa/core';
import mqtt from 'mqtt';
import type pg from 'pg';
import type { Config } from '../config.js';
import { LiveProcessor } from './live.js';

interface Logger { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void }

export const BRIDGE_TOPICS = ['sys/product/+/status', 'thing/product/+/osd', 'thing/product/+/events'];

export function startLiveBridge(config: Config, pool: pg.Pool, log: Logger) {
  if (!config.LIVE_MQTT_URL || !config.LIVE_MQTT_PASSWORD) return null;
  const processor = new LiveProcessor(pool, log);
  const client = mqtt.connect(config.LIVE_MQTT_URL, {
    username: config.LIVE_MQTT_USERNAME,
    password: config.LIVE_MQTT_PASSWORD,
    clientId: `certa-bridge-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 5000,
    clean: true,
  });
  client.on('connect', () => {
    log.info({}, 'live bridge connected');
    client.subscribe(BRIDGE_TOPICS, { qos: 1 }, (err) => err && log.error({ err }, 'live bridge subscribe failed'));
  });
  client.on('error', (err) => log.warn({ err: err.message }, 'live bridge connection error'));
  client.on('message', (topic, buf) => {
    void handle(topic, buf).catch((err) => log.error({ err, topic }, 'live message failed'));
  });

  async function handle(topic: string, buf: Buffer) {
    const t = parseDjiTopic(topic);
    if (!t || buf.length > 256 * 1024) return;
    let payload: unknown;
    try {
      payload = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    const now = Date.now();
    if (t.kind === 'status') {
      // DJI expects every topology update answered, or the controller keeps resending it.
      client.publish(`sys/product/${t.sn}/status_reply`, JSON.stringify(djiStatusReply(payload, now)), { qos: 1 });
      const topo = djiTopology(payload);
      if (topo) await processor.serial(t.sn, () => processor.topology(t.sn, topo.aircraft));
      return;
    }
    if (t.kind === 'events') {
      await processor.health(t.sn, djiHealthEvents(payload, now));
      return;
    }
    if (t.kind === 'osd') {
      const frame = djiOsdToFrame(t.sn, payload, now);
      if (!frame) return;
      const route = await processor.route(t.sn);
      if (!route || route.kind !== 'aircraft') return;
      await processor.ingest(route.orgId, frame, { gatewaySn: route.gatewaySn });
    }
  }

  const sweep = setInterval(() => void processor.sweep().catch((err) => log.error({ err }, 'live sweep failed')), 30_000);
  return {
    processor,
    client,
    stop: async () => {
      clearInterval(sweep);
      await client.endAsync();
    },
  };
}
