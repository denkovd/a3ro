import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { insertLead } from "../src/storage/leadRepo";
import { QueryResultLike, Queryable } from "../src/storage/db";

/** Stub Queryable that records every call (SQL text + params) and lets
 *  a test control what rows/rowCount come back. */
class StubDb implements Queryable {
  calls: { text: string; params: unknown[] }[] = [];
  responses: QueryResultLike[] = [];

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    const next = this.responses[this.calls.length - 1] ?? this.responses[this.responses.length - 1];
    return next ?? { rows: [], rowCount: 0 };
  }
}

describe("leadRepo", () => {
  test("insertLead issues an insert into leads with params in column order", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    await insertLead(db, { email: "a@example.com", message: "hi", context: "hormuz-vessel-detail" });

    assert.equal(db.calls.length, 1);
    const call = db.calls[0];
    assert.match(call.text.toLowerCase(), /insert into leads/);
    // column order: email, message, context
    assert.deepEqual(call.params, ["a@example.com", "hi", "hormuz-vessel-detail"]);
  });

  test("insertLead stores absent message as null (not undefined)", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    await insertLead(db, { email: "a@example.com" });

    const call = db.calls[0];
    assert.deepEqual(call.params, ["a@example.com", null, null]);
  });

  test("insertLead stores absent context as null (not undefined) when message is present", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    await insertLead(db, { email: "a@example.com", message: "need pricing" });

    const call = db.calls[0];
    assert.deepEqual(call.params, ["a@example.com", "need pricing", null]);
  });
});
