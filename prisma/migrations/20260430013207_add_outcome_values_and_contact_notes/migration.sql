-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CallOutcome" ADD VALUE 'connected';
ALTER TYPE "CallOutcome" ADD VALUE 'left_voicemail';
ALTER TYPE "CallOutcome" ADD VALUE 'bad_time_to_speak';
ALTER TYPE "CallOutcome" ADD VALUE 'in_a_meeting';
ALTER TYPE "CallOutcome" ADD VALUE 'on_holiday';
ALTER TYPE "CallOutcome" ADD VALUE 'hung_up';
ALTER TYPE "CallOutcome" ADD VALUE 'does_not_take_cold_calls';
ALTER TYPE "CallOutcome" ADD VALUE 'ai_assistant';
ALTER TYPE "CallOutcome" ADD VALUE 'line_engaged';
ALTER TYPE "CallOutcome" ADD VALUE 'wrong_number';
ALTER TYPE "CallOutcome" ADD VALUE 'mobile_switched_off';
ALTER TYPE "CallOutcome" ADD VALUE 'foreign_dial_tone';
ALTER TYPE "CallOutcome" ADD VALUE 'not_available';
ALTER TYPE "CallOutcome" ADD VALUE 'other';

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactNote_tenantId_contactId_idx" ON "ContactNote"("tenantId", "contactId");

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
