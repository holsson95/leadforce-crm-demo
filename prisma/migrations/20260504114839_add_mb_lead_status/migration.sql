-- CreateEnum
CREATE TYPE "MBLeadStatus" AS ENUM ('first_conversation', 'follow_up', 'nurtured_lead');

-- AlterTable
ALTER TABLE "CallRecord" ADD COLUMN     "mbLeadStatus" "MBLeadStatus";
