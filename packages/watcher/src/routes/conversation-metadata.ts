/**
 * Conversation metadata routes for watcher.
 */

import type { Hono } from "hono";
import {
  type ConversationMetadataInput,
  deleteConversationMetadata,
  getAllConversationMetadata,
  getConversationMetadata,
  setConversationMetadata
} from "@agentwatch/core";

export function registerConversationMetadataRoutes(app: Hono): void {
  app.get("/api/conversation-metadata", (c) => {
    return c.json(getAllConversationMetadata());
  });

  app.get("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const metadata = getConversationMetadata(conversationId);
    if (!metadata) {
      return c.json({ error: "Conversation metadata not found" }, 404);
    }
    return c.json(metadata);
  });

  app.patch("/api/conversation-metadata/:conversationId", async (c) => {
    const conversationId = c.req.param("conversationId");
    const input = (await c.req
      .json()
      .catch(() => ({}))) as ConversationMetadataInput;
    const metadata = setConversationMetadata(conversationId, input);
    return c.json(metadata);
  });

  app.delete("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const deleted = deleteConversationMetadata(conversationId);
    if (!deleted) {
      return c.json({ error: "Conversation metadata not found" }, 404);
    }
    return c.json({ success: true });
  });
}
