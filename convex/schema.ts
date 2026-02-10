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
