-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "clerkId" TEXT,
ADD COLUMN     "portalPermissions" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "Client_clerkId_key" ON "Client"("clerkId");
