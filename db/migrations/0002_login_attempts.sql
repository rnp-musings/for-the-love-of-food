CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_client_idx" ON "login_attempts" USING btree ("client_key","at");