-- CreateTable
CREATE TABLE "PendingPipelineDeal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingPipelineDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingPipelineDeal_tenantId_clientId_idx" ON "PendingPipelineDeal"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPipelineDeal_contactId_campaignId_key" ON "PendingPipelineDeal"("contactId", "campaignId");

-- AddForeignKey
ALTER TABLE "PendingPipelineDeal" ADD CONSTRAINT "PendingPipelineDeal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPipelineDeal" ADD CONSTRAINT "PendingPipelineDeal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPipelineDeal" ADD CONSTRAINT "PendingPipelineDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPipelineDeal" ADD CONSTRAINT "PendingPipelineDeal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
