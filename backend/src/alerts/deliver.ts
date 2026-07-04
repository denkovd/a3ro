/* ────────────────────────────────────────────────────────────────
   Alert delivery worker (channel-agnostic).

   This module does NOT hardcode any specific delivery channel
   (Slack, email, SMS, webhook, etc.). It is the responsibility of the
   caller to inject a delivery function that implements the desired
   notification mechanism. See RULES.md §4: "delivery is someone else's
   job" — this worker fetches, delivers, and marks events; channels
   are pluggable.
──────────────────────────────────────────────────────────────── */

import { AlertEvent, getUndeliveredAlertEvents, markAlertEventDelivered } from "../storage/alertRepo";
import { Queryable } from "../storage/db";

export type AlertDeliveryFn = (event: AlertEvent) => Promise<void>;

export interface DeliveryReport {
  attempted: number;
  delivered: number;
  failed: { id: string; error: string }[];
}

/**
 * Default, no-op delivery function for dev/testing.
 * Logs alerts to console and resolves immediately.
 * Real implementations (webhook, email, Slack, etc.) should be
 * injected by the caller via the `deliver` parameter.
 */
export const consoleAlertDelivery: AlertDeliveryFn = async (event: AlertEvent) => {
  console.log("[alert]", JSON.stringify(event));
};

/**
 * Fetch undelivered alert events and attempt delivery.
 *
 * For each event:
 *  - Call deliver(event)
 *  - If it resolves, mark the event delivered and count as delivered
 *  - If it throws, catch, record the error, and continue to the next event
 *    (one failure does not block the batch)
 *
 * @param db Database connection
 * @param deliver Channel-specific delivery function (injected by caller)
 * @param limit Maximum number of events to process in this batch
 * @returns Report of attempts, successes, and failures
 */
export async function deliverPendingAlerts(
  db: Queryable,
  deliver: AlertDeliveryFn,
  limit = 50,
): Promise<DeliveryReport> {
  const events = await getUndeliveredAlertEvents(db, limit);
  const report: DeliveryReport = {
    attempted: events.length,
    delivered: 0,
    failed: [],
  };

  for (const event of events) {
    try {
      await deliver(event);
      await markAlertEventDelivered(db, event.id);
      report.delivered++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      report.failed.push({ id: event.id, error: errorMessage });
    }
  }

  return report;
}
