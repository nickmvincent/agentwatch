/**
 * HuggingFace Integration Tests
 *
 * These tests verify the HuggingFace upload functionality works correctly.
 * They require real credentials and should only be run manually.
 *
 * PREREQUISITES:
 * 1. A HuggingFace account with a valid token
 * 2. A test dataset repository you have write access to
 * 3. Either:
 *    - Run `huggingface-cli login` to cache your token, OR
 *    - Set HF_TOKEN environment variable
 *
 * TO RUN:
 * ```bash
 * # Set up your test repo (replace with your own)
 * export HF_TEST_REPO="your-username/agentwatch-test"
 *
 * # Run the integration tests
 * cd packages/daemon
 * HF_INTEGRATION_TEST=1 bun test huggingface-integration.test.ts
 * ```
 *
 * WARNING: These tests will upload real data to your HuggingFace repository.
 * Use a dedicated test dataset, not a production one.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  checkHFCLIAuth,
  validateHuggingFaceToken,
  checkDatasetAccess,
  uploadToHuggingFace,
  type HFAuthStatus
} from "../src/huggingface";

// Skip all tests unless explicitly enabled
const INTEGRATION_TEST_ENABLED = process.env.HF_INTEGRATION_TEST === "1";
const TEST_REPO = process.env.HF_TEST_REPO || "";

// Skip helper - used to conditionally run tests
const itif = (condition: boolean) => (condition ? test : test.skip);
const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describe("HuggingFace Integration Tests", () => {
  // Always run these explanatory tests
  test("integration tests require HF_INTEGRATION_TEST=1 to run", () => {
    if (!INTEGRATION_TEST_ENABLED) {
      console.log(`
╭──────────────────────────────────────────────────────────────────────╮
│  HuggingFace Integration Tests                                        │
│                                                                       │
│  These tests are SKIPPED by default because they require:             │
│  1. Real HuggingFace credentials (huggingface-cli login or HF_TOKEN)  │
│  2. A test dataset repository (set HF_TEST_REPO=username/repo)        │
│                                                                       │
│  To run:                                                              │
│  HF_INTEGRATION_TEST=1 HF_TEST_REPO=you/test-repo bun test \\         │
│    huggingface-integration.test.ts                                    │
╰──────────────────────────────────────────────────────────────────────╯
      `);
    }
    expect(true).toBe(true); // Always passes
  });
});

describeIf(INTEGRATION_TEST_ENABLED)(
  "HuggingFace Auth (requires creds)",
  () => {
    let authStatus: HFAuthStatus;

    beforeAll(async () => {
      authStatus = await checkHFCLIAuth({ includeToken: true });
    });

    test("checkHFCLIAuth detects authentication status", async () => {
      console.log("Auth status:", {
        authenticated: authStatus.authenticated,
        username: authStatus.username,
        tokenMasked: authStatus.tokenMasked,
        source: authStatus.source,
        error: authStatus.error
      });

      // If not authenticated, provide helpful error
      if (!authStatus.authenticated) {
        console.error(`
╭──────────────────────────────────────────────────────────────────────╮
│  Authentication Required                                              │
│                                                                       │
│  Run one of:                                                          │
│  - huggingface-cli login                                              │
│  - export HF_TOKEN=hf_your_token_here                                 │
╰──────────────────────────────────────────────────────────────────────╯
      `);
      }

      expect(authStatus.authenticated).toBe(true);
      expect(authStatus.username).toBeTruthy();
    });

    test("validateHuggingFaceToken validates token", async () => {
      if (!authStatus.token) {
        throw new Error("No token available from checkHFCLIAuth");
      }

      const result = await validateHuggingFaceToken(authStatus.token);

      expect(result.valid).toBe(true);
      expect(result.username).toBe(authStatus.username);
    });

    test("validateHuggingFaceToken rejects invalid token", async () => {
      const result = await validateHuggingFaceToken("hf_invalid_token_12345");

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  }
);

describeIf(INTEGRATION_TEST_ENABLED && !!TEST_REPO)(
  "HuggingFace Dataset Access (requires repo)",
  () => {
    let authStatus: HFAuthStatus;

    beforeAll(async () => {
      authStatus = await checkHFCLIAuth({ includeToken: true });
      if (!authStatus.token) {
        throw new Error("No token available");
      }
    });

    test("checkDatasetAccess verifies repo exists and is writable", async () => {
      const result = await checkDatasetAccess(authStatus.token!, TEST_REPO);

      console.log("Dataset access check:", {
        repo: TEST_REPO,
        exists: result.exists,
        canWrite: result.canWrite,
        error: result.error
      });

      if (!result.exists) {
        console.error(`
╭──────────────────────────────────────────────────────────────────────╮
│  Dataset Not Found                                                    │
│                                                                       │
│  The test repo "${TEST_REPO}" does not exist.                         │
│  Create it at: https://huggingface.co/new-dataset                     │
│  Or set HF_TEST_REPO to an existing dataset you own.                  │
╰──────────────────────────────────────────────────────────────────────╯
        `);
      }

      expect(result.exists).toBe(true);
      expect(result.canWrite).toBe(true);
    });

    test("checkDatasetAccess handles non-existent repo", async () => {
      const result = await checkDatasetAccess(
        authStatus.token!,
        "nonexistent-user-12345/nonexistent-repo-67890"
      );

      expect(result.exists).toBe(false);
    });
  }
);

describeIf(INTEGRATION_TEST_ENABLED && !!TEST_REPO)(
  "HuggingFace Upload (requires repo)",
  () => {
    let authStatus: HFAuthStatus;
    const uploadedFiles: string[] = [];

    beforeAll(async () => {
      authStatus = await checkHFCLIAuth({ includeToken: true });
      if (!authStatus.token) {
        throw new Error("No token available");
      }

      // Verify dataset access first
      const access = await checkDatasetAccess(authStatus.token, TEST_REPO);
      if (!access.exists || !access.canWrite) {
        throw new Error(`Cannot access dataset ${TEST_REPO}: ${access.error}`);
      }
    });

    afterAll(() => {
      if (uploadedFiles.length > 0) {
        console.log(`
╭──────────────────────────────────────────────────────────────────────╮
│  Cleanup Required                                                     │
│                                                                       │
│  Test files were uploaded to: ${TEST_REPO}                            │
│  Files: ${uploadedFiles.join(", ")}                                   │
│                                                                       │
│  You may want to delete them from:                                    │
│  https://huggingface.co/datasets/${TEST_REPO}/tree/main/bundles       │
╰──────────────────────────────────────────────────────────────────────╯
        `);
      }
    });

    test("uploads JSONL bundle as direct commit", async () => {
      const bundleId = `test-integration-${Date.now()}`;
      const testContent = JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        message: "AgentWatch integration test"
      });

      const result = await uploadToHuggingFace(testContent, bundleId, {
        token: authStatus.token!,
        repoId: TEST_REPO,
        createPr: false, // Direct commit
        commitMessage: `[test] Integration test upload ${bundleId.slice(0, 8)}`
      });

      console.log("Upload result (direct commit):", {
        success: result.success,
        url: result.url,
        commitSha: result.commitSha,
        isPullRequest: result.isPullRequest,
        wasFallback: result.wasFallback,
        error: result.error
      });

      expect(result.success).toBe(true);
      expect(result.url).toBeTruthy();
      expect(result.isPullRequest).toBe(false);

      if (result.success) {
        uploadedFiles.push(`bundles/${bundleId}.jsonl`);
      }
    });

    test("uploads ZIP bundle as PR", async () => {
      const bundleId = `test-pr-${Date.now()}`;
      // Create a simple ZIP-like content (just bytes, not real ZIP)
      const testContent = new TextEncoder().encode(
        JSON.stringify({
          test: true,
          timestamp: new Date().toISOString(),
          message: "AgentWatch integration test (PR)"
        })
      );

      const result = await uploadToHuggingFace(testContent, bundleId, {
        token: authStatus.token!,
        repoId: TEST_REPO,
        createPr: true,
        commitMessage: `[test] Integration test PR ${bundleId.slice(0, 8)}`,
        prDescription: "Automated integration test - can be closed/deleted"
      });

      console.log("Upload result (PR):", {
        success: result.success,
        url: result.url,
        prNumber: result.prNumber,
        isPullRequest: result.isPullRequest,
        wasFallback: result.wasFallback,
        error: result.error
      });

      // PR creation might fail with fallback to direct commit - both are valid
      expect(result.success).toBe(true);
      expect(result.url).toBeTruthy();

      if (result.success) {
        uploadedFiles.push(`bundles/${bundleId}.zip`);
      }
    });

    test("handles upload with invalid token gracefully", async () => {
      const bundleId = `test-invalid-${Date.now()}`;
      const testContent = "test content";

      const result = await uploadToHuggingFace(testContent, bundleId, {
        token: "hf_invalid_token_12345",
        repoId: TEST_REPO,
        createPr: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test("handles upload to non-existent repo gracefully", async () => {
      const bundleId = `test-nonexistent-${Date.now()}`;
      const testContent = "test content";

      const result = await uploadToHuggingFace(testContent, bundleId, {
        token: authStatus.token!,
        repoId: "nonexistent-user-12345/nonexistent-repo-67890",
        createPr: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  }
);
