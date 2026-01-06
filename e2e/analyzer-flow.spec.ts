import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./screenshot-utils";

type FeedbackType = "positive" | "negative" | null;

const sessionId = "claude:session-1";
const sessionName = "Fixture: Build Analyzer Flow";

function createMockState() {
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();

  let feedback: FeedbackType = "positive";
  let notes = "Initial review looks good.";

  const conversation = {
    correlation_id: sessionId,
    match_type: "unmatched",
    match_details: {
      path_match: false,
      time_match: false,
      cwd_match: false,
      tool_count_match: false,
      score: 0
    },
    start_time: now - 60_000,
    cwd: "/tmp/analyzer-flow",
    agent: "claude",
    hook_session: null,
    transcript: {
      id: sessionId,
      agent: "claude",
      path: "/Users/test/.claude/projects/-tmp-analyzer-flow/session-1.jsonl",
      name: sessionName,
      project_dir: "/tmp/analyzer-flow",
      modified_at: now - 55_000,
      size_bytes: 2048,
      message_count: 2,
      start_time: now - 60_000,
      end_time: now - 30_000
    },
    process_snapshots: null,
    managed_session: null,
    project: null,
    tool_count: 0,
    snapshot_count: 0
  };

  const buildEnrichmentsList = () => {
    const positive = feedback === "positive" ? 1 : 0;
    const negative = feedback === "negative" ? 1 : 0;
    const unlabeled = feedback ? 0 : 1;

    return {
      sessions: [
        {
          id: sessionId,
          session_ref: { transcriptId: sessionId },
          has_auto_tags: true,
          has_outcome_signals: false,
          has_quality_score: true,
          has_manual_annotation: true,
          has_loop_detection: false,
          has_diff_snapshot: false,
          quality_score: 82,
          feedback,
          workflow_status: "reviewed",
          task_type: "bugfix",
          updated_at: updatedAt
        }
      ],
      stats: {
        totalSessions: 1,
        byType: {
          autoTags: 1,
          outcomeSignals: 0,
          qualityScore: 1,
          manualAnnotation: 1,
          loopDetection: 0,
          diffSnapshot: 0
        },
        annotated: { positive, negative, unlabeled },
        qualityDistribution: {
          excellent: 0,
          good: 1,
          fair: 0,
          poor: 0
        }
      }
    };
  };

  const buildSessionEnrichment = () => ({
    session_ref: { transcriptId: sessionId },
    auto_tags: {
      tags: [],
      taskType: "bugfix",
      userTags: [],
      computedAt: updatedAt
    },
    quality_score: {
      overall: 82,
      classification: "good",
      dimensions: {
        completion: 85,
        codeQuality: 80,
        efficiency: 78,
        safety: 90
      },
      heuristicSignals: {
        noFailures: { value: true, weight: 30 },
        reasonableToolCount: { value: true, weight: 20 }
      },
      computedAt: updatedAt
    },
    manual_annotation: {
      feedback,
      notes,
      userTags: ["fixture"],
      workflowStatus: "reviewed",
      updatedAt
    },
    updated_at: updatedAt
  });

  const setFeedback = (next: FeedbackType, nextNotes?: string) => {
    feedback = next;
    if (typeof nextNotes === "string") {
      notes = nextNotes;
    }
  };

  return {
    conversation,
    buildEnrichmentsList,
    buildSessionEnrichment,
    setFeedback
  };
}

async function mockAnalyzerApi(
  page: Page,
  state: ReturnType<typeof createMockState>
) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/config") {
      if (method === "PATCH") {
        return route.fulfill({ status: 200, body: "{}" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversations: { transcript_days: 30 },
          sharing: { redaction_config: {} }
        })
      });
    }

    if (path === "/api/contrib/correlated") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessions: [state.conversation],
          stats: {
            total: 1,
            exact: 0,
            confident: 0,
            uncertain: 0,
            unmatched: 1,
            hook_only: 0,
            transcript_only: 1,
            managed_only: 0,
            with_managed_session: 0
          }
        })
      });
    }

    if (path === "/api/conversation-metadata") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({})
      });
    }

    if (path === "/api/enrichments") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.buildEnrichmentsList())
      });
    }

    if (path === "/api/enrichments/workflow-stats") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          reviewed: 1,
          ready_to_contribute: 0,
          skipped: 0,
          pending: 0
        })
      });
    }

    if (path.startsWith("/api/enrichments/")) {
      if (path.endsWith("/annotation")) {
        const body = (await route.request().postDataJSON()) as {
          feedback?: FeedbackType;
          notes?: string;
        };
        state.setFeedback(body.feedback ?? null, body.notes);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            session_ref: { transcriptId: sessionId },
            manual_annotation: state.buildSessionEnrichment().manual_annotation
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.buildSessionEnrichment())
      });
    }

    if (path === "/api/annotations") {
      if (method === "POST") {
        const body = (await route.request().postDataJSON()) as {
          feedback?: FeedbackType;
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessionId,
            feedback: body.feedback ?? null,
            notes: "Annotation saved",
            updatedAt: new Date().toISOString()
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          [sessionId]: {
            sessionId,
            feedback: "positive",
            notes: "Annotation saved",
            updatedAt: new Date().toISOString()
          }
        })
      });
    }

    if (path === "/api/annotations/stats") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          positive: 1,
          negative: 0,
          unlabeled: 0,
          likelySuccess: 1,
          likelyFailed: 0,
          uncertain: 0
        })
      });
    }

    if (path === "/api/annotations/heuristics") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({})
      });
    }

    if (path.startsWith("/api/annotations/")) {
      if (method === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true })
        });
      }
      if (method === "POST") {
        const body = (await route.request().postDataJSON()) as {
          feedback?: FeedbackType;
          notes?: string;
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessionId,
            feedback: body.feedback ?? null,
            notes: body.notes ?? "Annotation saved",
            updatedAt: new Date().toISOString()
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          annotation: {
            sessionId,
            feedback: "positive",
            notes: "Annotation saved",
            updatedAt: new Date().toISOString()
          },
          heuristic: null
        })
      });
    }

    if (path === "/api/projects") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    }

    if (path === "/api/contrib/settings") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contributor_id: "fixture",
          license: "CC-BY-4.0",
          ai_preference: "train-genai=ok",
          hf_token: "",
          hf_dataset: ""
        })
      });
    }

    if (path === "/api/contrib/profiles") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          active_profile_id: "moderate",
          profiles: [
            {
              id: "moderate",
              name: "Moderate",
              description: "Balanced redaction",
              kept_fields: ["messages"],
              redaction_config: {
                redact_secrets: true,
                redact_pii: true,
                redact_paths: true,
                enable_high_entropy: true
              },
              is_default: true,
              is_builtin: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ]
        })
      });
    }

    if (path === "/api/contrib/destinations") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          default: "huggingface",
          destinations: [
            {
              id: "huggingface",
              name: "HuggingFace",
              description: "Fixture destination",
              is_public: true,
              requires_token: false
            }
          ]
        })
      });
    }

    if (path === "/api/contrib/history") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_contributions: 0,
          successful_contributions: 0,
          total_sessions: 0,
          total_chars: 0,
          recent: []
        })
      });
    }

    if (path === "/api/share/huggingface/cli-auth") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false })
      });
    }

    if (path === "/api/share/huggingface/oauth/config") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: false,
          clientId: null,
          redirectUri: "",
          scopes: [],
          setupUrl: ""
        })
      });
    }

    if (path === "/api/contrib/fields") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemas: {
            essential: [
              {
                path: "messages",
                label: "Messages",
                description: "Conversation messages",
                source: "transcript"
              }
            ],
            recommended: [],
            optional: [],
            strip: [],
            always_strip: []
          },
          default_selected: ["messages"]
        })
      });
    }

    if (path === "/api/contrib/prepare") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessions: [
            {
              session_id: sessionId,
              source: "transcript",
              preview_original: "User: My API key is sk-test-12345",
              preview_redacted: "User: My API key is [REDACTED]",
              score: 87,
              approx_chars: 120,
              raw_sha256: "fixture-sha",
              raw_json_original: JSON.stringify({
                type: "conversation",
                messages: [
                  {
                    role: "user",
                    content: "My API key is sk-test-12345"
                  }
                ],
                total_input_tokens: 12,
                total_output_tokens: 4
              }),
              raw_json: JSON.stringify({
                type: "conversation",
                messages: [
                  {
                    role: "user",
                    content: "My API key is [REDACTED]"
                  }
                ],
                total_input_tokens: 12,
                total_output_tokens: 4
              })
            }
          ],
          redaction_report: {
            total_redactions: 1,
            counts_by_category: { secrets: 1 },
            enabled_categories: ["secrets"],
            residue_warnings: [],
            blocked: false
          },
          stripped_fields: [],
          fields_present: ["messages"],
          fields_by_source: { transcript: ["messages"] },
          stats: {
            totalSessions: 1,
            totalRedactions: 1,
            totalFieldsStripped: 0,
            averageScore: 87
          }
        })
      });
    }

    if (path === "/api/contrib/export/bundle") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bundle_id: "fixture-bundle",
          session_count: 1,
          tool_usage_count: 0,
          redaction_count: 1,
          categories: { secrets: 1 },
          content: '{"type":"conversation","messages":[]}\n'
        })
      });
    }

    return route.fallback();
  });
}

test.describe("Analyzer UI - Sessions to Share Flow", () => {
  test.beforeEach(async ({ page }) => {
    const state = createMockState();
    await mockAnalyzerApi(page, state);
    await page.goto("/");
    await waitForStable(page);
  });

  test("loads sessions, shows preview, and saves feedback", async ({
    page
  }) => {
    await expect(page.getByText(sessionName)).toBeVisible();
    await page.getByText(sessionName).click();
    await expect(page.getByText("Your Annotation")).toBeVisible();

    const positiveButton = page.getByTitle("Mark as positive").first();
    await positiveButton.click();
    await expect(positiveButton).toHaveClass(/bg-green-600/);
  });

  test("renders share preview and exports bundle", async ({ page }) => {
    await page.getByRole("button", { name: "Share" }).click();
    await waitForStable(page);

    const sessionRow = page.getByText(sessionName).first();
    await sessionRow.scrollIntoViewIfNeeded();
    const checkbox = sessionRow.locator("..").locator("..").locator("input");
    await checkbox.check();

    await expect(page.getByText("Score: 87")).toBeVisible();

    await page.getByText("Contributor & Export").click();
    const downloadButton = page.getByRole("button", { name: "Download" });
    await downloadButton.click();
    await expect(
      page.getByText(/Bundle downloaded to your Downloads folder/i)
    ).toBeVisible();
  });
});
