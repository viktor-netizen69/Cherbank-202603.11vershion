import { pgTable, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  cardNumber: text("card_number").notNull().unique(),
  balance: integer("balance").notNull().default(1000),
  isFrozen: boolean("is_frozen").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  hasCherPlus: boolean("has_cher_plus").notNull().default(false),
  cardSkin: text("card_skin").notNull().default("default"),
  bioUrl: text("bio_url").default(""),
  activeLoan: jsonb("active_loan"),
  activeDeposit: jsonb("active_deposit"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  fromUser: text("from_user").notNull(),
  toUser: text("to_user").notNull(),
  amount: integer("amount").notNull(),
  fee: integer("fee").notNull().default(0),
  comment: text("comment").notNull().default(""),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bankSettings = pgTable("bank_settings", {
  id: text("id").primaryKey(),
  transferFeePercent: integer("transfer_fee_percent").notNull().default(3),
  loanRatePercent: integer("loan_rate_percent").notNull().default(10),
  loanMaxAmount: integer("loan_max_amount").notNull().default(50000),
  loanMaxTermDays: integer("loan_max_term_days").notNull().default(7),
  loanPenaltyAmount: integer("loan_penalty_amount").notNull().default(1000),
  depositRatePercent: integer("deposit_rate_percent").notNull().default(5),
  depositTermDays: integer("deposit_term_days").notNull().default(3),
});
