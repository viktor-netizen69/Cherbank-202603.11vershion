CREATE TABLE "bank_settings" (
	"id" text PRIMARY KEY,
	"transfer_fee_percent" integer DEFAULT 3 NOT NULL,
	"loan_rate_percent" integer DEFAULT 10 NOT NULL,
	"loan_max_amount" integer DEFAULT 50000 NOT NULL,
	"loan_max_term_days" integer DEFAULT 7 NOT NULL,
	"loan_penalty_amount" integer DEFAULT 1000 NOT NULL,
	"deposit_rate_percent" integer DEFAULT 5 NOT NULL,
	"deposit_term_days" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY,
	"from_user" text NOT NULL,
	"to_user" text NOT NULL,
	"amount" integer NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"password" text NOT NULL,
	"card_number" text NOT NULL UNIQUE,
	"balance" integer DEFAULT 1000 NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"has_cher_plus" boolean DEFAULT false NOT NULL,
	"card_skin" text DEFAULT 'default' NOT NULL,
	"bio_url" text DEFAULT '',
	"active_loan" jsonb,
	"active_deposit" jsonb,
	"created_at" timestamp DEFAULT now()
);
