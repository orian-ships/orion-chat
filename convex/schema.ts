import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    siteId: v.string(),
    name: v.string(),
    domain: v.string(),
    repo: v.string(),
    tokenHash: v.string(),
    clientName: v.string(),
    clientEmail: v.optional(v.string()),
    active: v.boolean(),
    systemPrompt: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_siteId", ["siteId"])
    .index("by_tokenHash", ["tokenHash"]),

  messages: defineTable({
    siteId: v.string(),
    role: v.string(),
    content: v.string(),
    status: v.string(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_siteId", ["siteId"])
    .index("by_siteId_created", ["siteId", "createdAt"]),

  // === Project Scoping Tables ===
  scopingSessions: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    status: v.string(), // "active" | "brief_ready" | "submitted" | "approved" | "rejected" | "building" | "review" | "live"
    briefData: v.optional(v.string()), // JSON string
    repoUrl: v.optional(v.string()),
    deployUrl: v.optional(v.string()),
    widgetSiteId: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    ticketId: v.optional(v.id("tickets")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  scopingMessages: defineTable({
    sessionId: v.string(),
    role: v.string(), // "user" | "assistant" | "system"
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_created", ["sessionId", "createdAt"]),

  scopingUsers: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    magicLinkToken: v.optional(v.string()),
    magicLinkExpiry: v.optional(v.number()),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_magicLinkToken", ["magicLinkToken"]),

  tickets: defineTable({
    siteId: v.string(),
    title: v.string(),
    description: v.string(),
    type: v.string(),
    status: v.string(),
    priority: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    metadata: v.optional(v.string()),
    clientToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_siteId", ["siteId"])
    .index("by_status", ["status"])
    .index("by_siteId_status", ["siteId", "status"]),
});
