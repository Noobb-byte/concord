import { describe, expect, it } from "vitest";
import { Db } from "../src/db.js";

describe("Db.tx", () => {
  it("commits on success: inserts row, returns callback value, row count is 1", () => {
    const db = new Db(":memory:", ["CREATE TABLE x (a INTEGER);"]);
    try {
      const result = db.tx(() => {
        db.insert("INSERT INTO x (a) VALUES (1)");
        return "success-value";
      });
      expect(result).toBe("success-value");
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM x")?.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rolls back on throw: rethrows the original error object and row count is 0", () => {
    const db = new Db(":memory:", ["CREATE TABLE x (a INTEGER);"]);
    try {
      const originalError = new Error("custom rollback error");
      let caught: unknown;
      try {
        db.tx(() => {
          db.insert("INSERT INTO x (a) VALUES (1)");
          throw originalError;
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(originalError);
      expect((caught as Error).message).toBe("custom rollback error");
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM x")?.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it("refuses nested transaction: inner throws and outer insert is rolled back", () => {
    const db = new Db(":memory:", ["CREATE TABLE x (a INTEGER);"]);
    try {
      let innerError: unknown;
      let outerError: unknown;
      try {
        db.tx(() => {
          db.insert("INSERT INTO x (a) VALUES (1)");
          try {
            db.tx(() => {
              db.insert("INSERT INTO x (a) VALUES (2)");
            });
          } catch (err) {
            innerError = err;
            throw err;
          }
        });
      } catch (err) {
        outerError = err;
      }
      expect(innerError).toBeInstanceOf(Error);
      expect((innerError as Error).message).toMatch(/cannot start a transaction within a transaction/);
      expect(outerError).toBe(innerError);
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM x")?.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it("recovers afterwards: new transaction works and commits after nested transaction failure", () => {
    const db = new Db(":memory:", ["CREATE TABLE x (a INTEGER);"]);
    try {
      expect(() => {
        db.tx(() => {
          db.insert("INSERT INTO x (a) VALUES (1)");
          db.tx(() => {
            db.insert("INSERT INTO x (a) VALUES (2)");
          });
        });
      }).toThrow(/cannot start a transaction within a transaction/);
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM x")?.n).toBe(0);

      const recoveredResult = db.tx(() => {
        db.insert("INSERT INTO x (a) VALUES (3)");
        return "recovered-ok";
      });
      expect(recoveredResult).toBe("recovered-ok");
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM x")?.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
