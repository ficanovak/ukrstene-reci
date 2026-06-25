-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_external_id_key" ON "users"("auth_provider", "external_id");
