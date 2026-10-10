import type { RelayKitDatabase } from "@relayrtc/database";
import type { ConnectionQualityEvent } from "@relayrtc/types";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  QualityEventPublisher,
  QualityEventType,
  QualityTransition,
} from "./quality-event-publisher.js";
import type { QualityMetricSample, QualityMetricsStore } from "./quality-metrics-store.js";

export class QualityObservationQueue {
  readonly #pending: {
    sample: QualityMetricSample;
    transition?: QualityTransition;
    expiresAt: number;
  }[] = [];
  #running: Promise<void> | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  expired = 0;
  constructor(
    readonly store?: QualityMetricsStore,
    readonly publisher?: QualityEventPublisher,
    readonly onError?: (error: unknown) => void,
  ) {}
  get backlog(): number {
    return this.#pending.length;
  }
  record(sample: QualityMetricSample, transition?: QualityTransition): void {
    if (this.#closed) return;
    if (this.#pending.length >= 2048) {
      this.#pending.shift();
      this.expired++;
      this.onError?.(
        new Error("Quality observation queue capacity reached; oldest observation expired"),
      );
    }
    this.#pending.push({
      sample: { ...sample, sampleId: sample.sampleId ?? randomUUID() },
      ...(transition ? { transition } : {}),
      expiresAt: Date.now() + 300_000,
    });
    this.#start();
  }
  #start(): void {
    if (this.#running || this.#retry || this.#closed) return;
    this.#running = this.#flush().finally(() => {
      this.#running = undefined;
      if (this.#pending.length) this.#start();
    });
  }
  async #flush(): Promise<void> {
    while (this.#pending.length && !this.#closed) {
      const item = this.#pending[0];
      if (!item) return;
      if (item.expiresAt <= Date.now()) {
        this.#pending.shift();
        this.expired++;
        continue;
      }
      try {
        await this.store?.record(item.sample, item.transition);
        if (item.transition && !this.store?.persistsEvents)
          await this.publisher?.publish(item.transition.type, item.transition.event);
        if (this.#pending[0] === item) this.#pending.shift();
      } catch (error) {
        this.onError?.(error);
        this.#retry = setTimeout(() => {
          this.#retry = undefined;
          this.#start();
        }, 1000);
        this.#retry.unref();
        return;
      }
    }
  }
  async close(): Promise<void> {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    // Give the bounded database operation a chance to persist before stopping.
    if (!this.#running && this.#pending.length) this.#start();
    this.#closed = true;
    await this.#running;
    clearTimeout(this.#retry);
    this.expired += this.#pending.length;
    this.#pending.length = 0;
  }
}

interface OutboxRow {
  id: string;
  event_type: QualityEventType;
  payload: ConnectionQualityEvent;
  attempts: number;
}
export class QualityEventOutbox {
  #timer: ReturnType<typeof setInterval> | undefined;
  #running: Promise<void> | undefined;
  pending = 0;
  expired = 0;
  delivered = 0;
  failed = 0;
  constructor(
    readonly database: RelayKitDatabase,
    readonly publisher: QualityEventPublisher,
    readonly onError: (error: unknown) => void,
  ) {}
  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.#tick();
    }, 1000);
    this.#timer.unref();
    this.#tick();
  }
  #tick(): void {
    if (this.#running) return;
    this.#running = this.#flush()
      .catch(this.onError)
      .finally(() => {
        this.#running = undefined;
      });
  }
  async #flush(): Promise<void> {
    await this.database
      .execute(sql`update rtc_quality_event_outbox set expired_at = now(), last_error = 'delivery deadline reached'
      where delivered_at is null and expired_at is null and expires_at <= now()`);
    const rows = await this.database.execute(sql`with candidates as (
      select e.id from rtc_quality_event_outbox e
      where e.delivered_at is null and e.expired_at is null and e.expires_at > now() and e.next_attempt_at <= now()
      and not exists (select 1 from rtc_quality_event_outbox older where older.room_id = e.room_id and older.session_id = e.session_id
        and older.delivered_at is null and older.expired_at is null and (older.occurred_at, older.id) < (e.occurred_at, e.id))
      order by e.occurred_at, e.id limit 8 for update skip locked)
      update rtc_quality_event_outbox e set next_attempt_at = now() + interval '30 seconds', attempts = attempts + 1
      from candidates c where c.id = e.id returning e.id, e.event_type, e.payload, e.attempts`);
    await Promise.all(
      [...rows].map(async (raw) => {
        const row = raw as unknown as OutboxRow;
        try {
          await this.publisher.publish(row.event_type, row.payload);
          await this.database.execute(
            sql`update rtc_quality_event_outbox set delivered_at = now(), last_error = null where id = ${row.id}`,
          );
          this.delivered++;
        } catch (error) {
          this.failed++;
          this.onError(error);
          const delay = Math.min(30_000, 500 * 2 ** Math.min(row.attempts, 6));
          await this.database.execute(
            sql`update rtc_quality_event_outbox set next_attempt_at = ${new Date(Date.now() + delay).toISOString()}, last_error = 'publication failed' where id = ${row.id}`,
          );
        }
      }),
    );
    const counts = await this.database
      .execute(sql`select count(*) filter (where delivered_at is null and expired_at is null)::integer as pending,
      count(*) filter (where expired_at is not null)::integer as expired from rtc_quality_event_outbox`);
    this.pending = Number(counts[0]?.pending ?? 0);
    this.expired = Number(counts[0]?.expired ?? 0);
    await this.database.execute(
      sql`delete from rtc_quality_event_outbox where coalesce(delivered_at, expired_at) < now() - interval '1 day'`,
    );
    await this.database.execute(
      sql`delete from rtc_quality_sample_receipt where recorded_at < now() - interval '1 day'`,
    );
  }
  async close(): Promise<void> {
    clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#running;
  }
}
