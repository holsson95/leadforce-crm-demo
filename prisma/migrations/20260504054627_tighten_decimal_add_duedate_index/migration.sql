/*
  Warnings:

  - You are about to alter the column `value` on the `PipelineDeal` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.

*/
-- AlterTable
ALTER TABLE "PipelineDeal" ALTER COLUMN "value" SET DATA TYPE DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "Task_tenantId_dueDate_idx" ON "Task"("tenantId", "dueDate");
