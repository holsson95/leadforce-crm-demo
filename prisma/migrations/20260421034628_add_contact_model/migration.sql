-- CreateEnum
CREATE TYPE "ContactList" AS ENUM ('prospect', 'lead', 'dnc', 'future', 'call_back', 'meeting_booked');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "list" "ContactList" NOT NULL DEFAULT 'prospect',
    "dncReason" TEXT,
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_tenantId_campaignId_idx" ON "Contact"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_list_idx" ON "Contact"("tenantId", "list");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_dedupeHash_key" ON "Contact"("tenantId", "dedupeHash");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
