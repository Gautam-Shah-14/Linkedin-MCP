ALTER TABLE "oauth_clients" ADD COLUMN "data" jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_idx" ON "oauth_clients" USING btree ("client_id");