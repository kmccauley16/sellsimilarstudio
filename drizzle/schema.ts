import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  // Stable internal identifier, generated locally at registration (formerly issued by an external OAuth provider).
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const ebayConnections = mysqlTable(
  "ebay_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketplaceId: varchar("marketplaceId", { length: 24 }).default("EBAY_US").notNull(),
    environment: mysqlEnum("environment", ["sandbox", "production"])
      .default("production")
      .notNull(),
    // Commerce Identity user IDs are opaque provider values; do not impose a username-sized limit.
    ebayUserId: text("ebayUserId"),
    fulfillmentPolicyId: varchar("fulfillmentPolicyId", { length: 64 }),
    paymentPolicyId: varchar("paymentPolicyId", { length: 64 }),
    returnPolicyId: varchar("returnPolicyId", { length: 64 }),
    merchantLocationKey: varchar("merchantLocationKey", { length: 64 }),
    accessTokenEncrypted: text("accessTokenEncrypted").notNull(),
    refreshTokenEncrypted: text("refreshTokenEncrypted").notNull(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("ebay_connections_user_unique").on(table.userId)],
);

export const listingImports = mysqlTable(
  "listing_imports",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceUrl: text("sourceUrl").notNull(),
    sourceItemId: varchar("sourceItemId", { length: 32 }).notNull(),
    title: varchar("title", { length: 80 }).notNull(),
    description: text("description").notNull(),
    itemSpecifics: text("itemSpecifics").notNull(),
    keywords: text("keywords"),
    // Reference-only source imagery is retained separately and is never eligible for draft submission.
    imageUrls: text("imageUrls").notNull(),
    // Seller-owned or seller-authorized uploads eligible for a native Seller Hub draft.
    ownedImageUrls: varchar("ownedImageUrls", { length: 8192 }).notNull().default("[]"),
    selectedImageUrls: text("selectedImageUrls").notNull(),
    photoRightsAttestedAt: timestamp("photoRightsAttestedAt"),
    itemAccuracyAttestedAt: timestamp("itemAccuracyAttestedAt"),
    conditionId: varchar("conditionId", { length: 32 }),
    conditionName: varchar("conditionName", { length: 120 }),
    price: decimal("price", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    categoryId: varchar("categoryId", { length: 32 }),
    categoryName: varchar("categoryName", { length: 255 }),
    quantity: int("quantity").default(1).notNull(),
    status: mysqlEnum("status", ["review", "draft submitted", "draft processing", "draft created", "published", "failed"])
      .default("review")
      .notNull(),
    errorMessage: text("errorMessage"),
    // Private seller notes (e.g. instructions for a VA); never sent to eBay.
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("listing_imports_user_created_idx").on(table.userId, table.createdAt),
    index("listing_imports_source_item_idx").on(table.sourceItemId),
  ],
);

export const ebayDrafts = mysqlTable(
  "ebay_drafts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingImportId: int("listingImportId")
      .notNull()
      .references(() => listingImports.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 50 }).notNull(),
    workflow: mysqlEnum("workflow", ["inventory_offer", "seller_hub_feed"])
      .default("inventory_offer")
      .notNull(),
    offerId: varchar("offerId", { length: 64 }),
    // eBay's live item ID, set only after the seller explicitly publishes this offer.
    listingId: varchar("listingId", { length: 64 }),
    feedTaskId: varchar("feedTaskId", { length: 128 }),
    feedStatus: varchar("feedStatus", { length: 48 }),
    feedSuccessCount: int("feedSuccessCount"),
    feedFailureCount: int("feedFailureCount"),
    resultMessage: text("resultMessage"),
    marketplaceId: varchar("marketplaceId", { length: 24 }).default("EBAY_US").notNull(),
    sellerHubUrl: text("sellerHubUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("ebay_drafts_import_unique").on(table.listingImportId),
    uniqueIndex("ebay_drafts_offer_unique").on(table.offerId),
    uniqueIndex("ebay_drafts_feed_task_unique").on(table.feedTaskId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type EbayConnection = typeof ebayConnections.$inferSelect;
export type ListingImport = typeof listingImports.$inferSelect;
export type EbayDraft = typeof ebayDrafts.$inferSelect;
