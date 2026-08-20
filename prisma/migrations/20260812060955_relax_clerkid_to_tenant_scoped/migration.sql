/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,clerkId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_clerkId_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_clerkId_key" ON "User"("tenantId", "clerkId");
