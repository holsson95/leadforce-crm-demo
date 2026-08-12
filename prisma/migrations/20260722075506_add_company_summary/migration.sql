-- CreateEnum
CREATE TYPE "CompanySummaryStatus" AS ENUM ('pending', 'generating', 'ready', 'failed');

-- CreateTable
CREATE TABLE "CompanySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "websiteDomain" TEXT NOT NULL,
    "summary" TEXT,
    "status" "CompanySummaryStatus" NOT NULL DEFAULT 'pending',
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanySummary_tenantId_idx" ON "CompanySummary"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySummary_tenantId_websiteDomain_key" ON "CompanySummary"("tenantId", "websiteDomain");

-- AddForeignKey
ALTER TABLE "CompanySummary" ADD CONSTRAINT "CompanySummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
