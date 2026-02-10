import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    siteId: v.string(),
    title: v.string(),
    description: v.string(),
    type: v.string(),
    priority: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    metadata: v.optional(v.string()),
    clientToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tickets", {
      ...args,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: {
    siteId: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, status, limit }) => {
    let q;
    if (siteId && status) {
      q = ctx.db.query("tickets").withIndex("by_siteId_status", (i) => i.eq("siteId", siteId).eq("status", status));
    } else if (siteId) {
      q = ctx.db.query("tickets").withIndex("by_siteId", (i) => i.eq("siteId", siteId));
    } else if (status) {
      q = ctx.db.query("tickets").withIndex("by_status", (i) => i.eq("status", status));
    } else {
      q = ctx.db.query("tickets");
    }
    const results = await q.order("desc").take(limit || 100);
    return results;
  },
});

export const update = mutation({
  args: {
    id: v.id("tickets"),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch);
  },
});

export const getOpen = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tickets").withIndex("by_status", (i) => i.eq("status", "open")).collect();
  },
});

export const getById = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tickets").order("desc").collect();
  },
});
