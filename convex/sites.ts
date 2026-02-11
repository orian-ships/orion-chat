import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByTokenHash = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    return await ctx.db
      .query("sites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
  },
});

export const getBySiteId = query({
  args: { siteId: v.string() },
  handler: async (ctx, { siteId }) => {
    return await ctx.db
      .query("sites")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .first();
  },
});

export const create = mutation({
  args: {
    siteId: v.string(),
    name: v.string(),
    domain: v.string(),
    repo: v.string(),
    tokenHash: v.string(),
    clientName: v.string(),
    clientEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sites", {
      ...args,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    siteId: v.string(),
    name: v.optional(v.string()),
    domain: v.optional(v.string()),
    repo: v.optional(v.string()),
    clientName: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    active: v.optional(v.boolean()),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { siteId, ...fields }) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .first();
    if (!site) throw new Error("Site not found");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(site._id, updates);
    }
    return { ok: true };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sites").collect();
  },
});
