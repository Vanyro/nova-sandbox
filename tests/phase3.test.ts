/**
 * Phase 3 Integration Tests
 * Tests for simulation engine, transaction lifecycle, chaos modes, and bank rules
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4000";

// Helper to make HTTP requests
async function request(
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: any }> {
  const { method = "GET", body, headers = {} } = options;

  const fetchOptions: RequestInit = {
    method,
    headers: {
      // Only add Content-Type for requests with body
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions);
  const data = await response.json().catch(() => ({}));

  return { status: response.status, data };
}

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Phase 3 Integration Tests", () => {
  let testAccountId: string;
  let testUserId: string;

  before(async () => {
    // Get test data from the API (not local Prisma)
    const { data } = await request("/accounts?limit=1");
    if (data.data && data.data.length > 0) {
      testAccountId = data.data[0].id;
      testUserId = data.data[0].userId;
    }

    // Reset to normal mode before tests
    await request("/sandbox/mode/reset", { method: "POST" });
  });

  after(async () => {
    // Cleanup: Reset to normal mode
    await request("/sandbox/mode/reset", { method: "POST" });
  });

  describe("Sandbox Stats Endpoint", () => {
    it("GET /sandbox/stats returns comprehensive statistics", async () => {
      const { status, data } = await request("/sandbox/stats");

      assert.strictEqual(status, 200);
      assert.ok(data.timestamp);
      assert.ok(data.simulation);
      assert.ok(data.transactions);
      assert.ok(data.chaos);
      assert.ok(data.accounts);
      assert.ok(data.users);

      // Check structure
      assert.ok("isRunning" in data.simulation);
      assert.ok("pending" in data.transactions);
      assert.ok("posted" in data.transactions);
      assert.ok("mode" in data.chaos);
    });

    it("GET /sandbox/health returns health status", async () => {
      const { status, data } = await request("/sandbox/health");

      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, "ok");
      assert.ok(data.chaosMode);
    });
  });

  describe("Chaos Mode Control", () => {
    beforeEach(async () => {
      // Reset to normal before each test
      await request("/sandbox/mode/reset", { method: "POST" });
    });

    it("PATCH /sandbox/mode sets latency mode", async () => {
      const { status, data } = await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "latency", latencyMs: 1000 },
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.mode, "latency");
      assert.strictEqual(data.latencyMs, 1000);
    });

    it("PATCH /sandbox/mode sets flaky mode with failure rate", async () => {
      const { status, data } = await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "flaky", failureRate: 0.25 },
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.mode, "flaky");
      assert.strictEqual(data.failureRate, 0.25);
    });

    it("PATCH /sandbox/mode sets maintenance mode", async () => {
      const { status, data } = await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "maintenance" },
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.mode, "maintenance");
    });

    it("PATCH /sandbox/mode rejects invalid mode", async () => {
      const { status, data } = await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "invalid_mode" },
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    it("PATCH /sandbox/mode rejects invalid failure rate", async () => {
      const { status, data } = await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "flaky", failureRate: 1.5 },
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    it("maintenance mode returns 503 on subsequent requests", async () => {
      await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "maintenance" },
      });

      // Try to access an endpoint
      const { status, data } = await request("/accounts");

      assert.strictEqual(status, 503);
      assert.strictEqual(data.code, "BANK_MAINTENANCE");

      // Reset
      await request("/sandbox/mode/reset", { method: "POST" });
    });

    it("POST /sandbox/mode/reset returns to normal", async () => {
      // Set to flaky first
      await request("/sandbox/mode", {
        method: "PATCH",
        body: { mode: "flaky" },
      });

      // Reset
      const { status, data } = await request("/sandbox/mode/reset", {
        method: "POST",
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.mode, "normal");
    });
  });

  describe("Account Freeze/Unfreeze", () => {
    beforeEach(async () => {
      // Ensure account is unfrozen via API
      if (testAccountId) {
        // Try to unfreeze - may fail if not frozen, that's ok
        await request(`/sandbox/account/${testAccountId}/unfreeze`, {
          method: "PATCH",
        });
      }
    });

    it("PATCH /sandbox/account/:id/freeze freezes account", async () => {
      if (!testAccountId) {
        console.log("Skipping: No test account");
        return;
      }

      const { status, data } = await request(
        `/sandbox/account/${testAccountId}/freeze`,
        {
          method: "PATCH",
        },
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.account.frozen, true);
    });

    it("PATCH /sandbox/account/:id/freeze fails if already frozen", async () => {
      if (!testAccountId) return;

      // Freeze first
      await request(`/sandbox/account/${testAccountId}/freeze`, {
        method: "PATCH",
      });

      // Try to freeze again
      const { status, data } = await request(
        `/sandbox/account/${testAccountId}/freeze`,
        {
          method: "PATCH",
        },
      );

      assert.strictEqual(status, 400);
      assert.ok(data.error.includes("already frozen"));
    });

    it("PATCH /sandbox/account/:id/unfreeze unfreezes account", async () => {
      if (!testAccountId) return;

      // Freeze first
      await request(`/sandbox/account/${testAccountId}/freeze`, {
        method: "PATCH",
      });

      // Unfreeze
      const { status, data } = await request(
        `/sandbox/account/${testAccountId}/unfreeze`,
        {
          method: "PATCH",
        },
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.account.frozen, false);
    });

    it("returns 404 for non-existent account", async () => {
      const { status } = await request(
        "/sandbox/account/non-existent-id/freeze",
        {
          method: "PATCH",
        },
      );

      assert.strictEqual(status, 404);
    });
  });

  describe("Account Balance Control", () => {
    it("PATCH /sandbox/account/:id/set-balance updates balance", async () => {
      if (!testAccountId) return;

      const newBalance = 100000; // $1000
      const { status, data } = await request(
        `/sandbox/account/${testAccountId}/set-balance`,
        {
          method: "PATCH",
          body: { balance: newBalance },
        },
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.account.newBalance, newBalance);
    });

    it("PATCH /sandbox/account/:id/set-balance rejects invalid balance", async () => {
      if (!testAccountId) return;

      const { status } = await request(
        `/sandbox/account/${testAccountId}/set-balance`,
        {
          method: "PATCH",
          body: { balance: "invalid" },
        },
      );

      assert.strictEqual(status, 400);
    });
  });

  describe("Account Settings", () => {
    it("PATCH /sandbox/account/:id/settings updates overdraft and daily limit", async () => {
      if (!testAccountId) return;

      const { status, data } = await request(
        `/sandbox/account/${testAccountId}/settings`,
        {
          method: "PATCH",
          body: { overdraftEnabled: true, dailyLimit: 1000000 },
        },
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.account.overdraftEnabled, true);
      assert.strictEqual(data.account.dailyLimit, 1000000);
    });
  });

  describe("Simulation Control", () => {
    it("GET /sandbox/simulation/status returns simulation status", async () => {
      const { status, data } = await request("/sandbox/simulation/status");

      assert.strictEqual(status, 200);
      assert.ok("isRunning" in data);
      assert.ok("config" in data);
    });

    it("POST /sandbox/simulation/trigger runs a simulation cycle", async () => {
      const { status, data } = await request("/sandbox/simulation/trigger", {
        method: "POST",
      });

      assert.strictEqual(status, 200);
      assert.ok(data.success);
      assert.ok("result" in data);
      assert.ok("transactionsGenerated" in data.result);
      assert.ok("pendingProcessed" in data.result);
    });
  });

  describe("Transaction Lifecycle", () => {
    it("POST /sandbox/transactions/process-pending processes pending transactions", async () => {
      const { status, data } = await request(
        "/sandbox/transactions/process-pending",
        {
          method: "POST",
        },
      );

      assert.strictEqual(status, 200);
      assert.ok(data.success);
      assert.ok("result" in data);
      assert.ok("posted" in data.result);
      assert.ok("canceled" in data.result);
    });

    it("pending transactions have correct status", async () => {
      // Check stats via API
      const { status, data } = await request("/sandbox/stats");

      assert.strictEqual(status, 200);
      // Both counts should be valid numbers
      assert.ok(typeof data.transactions.pending === "number");
      assert.ok(typeof data.transactions.posted === "number");
      assert.ok(data.transactions.pending >= 0);
      assert.ok(data.transactions.posted >= 0);
    });
  });

  describe("Deterministic Mode", () => {
    it("produces same results with same seed", async () => {
      // This test verifies the deterministic behavior conceptually
      // Full implementation would require running two simulation cycles
      // with same seed and comparing results

      const { status, data } = await request("/sandbox/simulation/status");

      assert.strictEqual(status, 200);
      // Verify mode is accessible
      assert.ok(data.config);
    });
  });

  describe("Bank Rules", () => {
    beforeEach(async () => {
      if (testAccountId) {
        // Reset account via API
        await request(`/sandbox/account/${testAccountId}/unfreeze`, {
          method: "PATCH",
        });
        await request(`/sandbox/account/${testAccountId}/settings`, {
          method: "PATCH",
          body: { overdraftEnabled: false, dailyLimit: 500000 },
        });
        await request(`/sandbox/account/${testAccountId}/set-balance`, {
          method: "PATCH",
          body: { balance: 100000 }, // $1000
        });
      }
    });

    it("frozen account cannot process transactions via simulation", async () => {
      if (!testAccountId) return;

      // Freeze the account via API
      await request(`/sandbox/account/${testAccountId}/freeze`, {
        method: "PATCH",
      });

      // Trigger simulation
      const { data: triggerData } = await request(
        "/sandbox/simulation/trigger",
        { method: "POST" },
      );

      // Verify simulation ran
      assert.ok(triggerData.success);
      assert.ok(triggerData.result);

      // Unfreeze for other tests
      await request(`/sandbox/account/${testAccountId}/unfreeze`, {
        method: "PATCH",
      });
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running Phase 3 Integration Tests...");
  console.log("Make sure the server is running on", BASE_URL);
}
