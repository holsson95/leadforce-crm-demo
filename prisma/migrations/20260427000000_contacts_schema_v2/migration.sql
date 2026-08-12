-- Step 1: Rename enum ContactList → ContactStatus
ALTER TYPE "ContactList" RENAME TO "ContactStatus";

-- Step 2: Rename column list → status on Contact
ALTER TABLE "Contact" RENAME COLUMN "list" TO "status";

-- Step 3: Rename column phone → mobilePhone on Contact
ALTER TABLE "Contact" RENAME COLUMN "phone" TO "mobilePhone";

-- Step 4: Add new columns to Contact
ALTER TABLE "Contact" ADD COLUMN "accountOwnerId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "corporatePhone" TEXT;
ALTER TABLE "Contact" ADD COLUMN "industry" TEXT;
ALTER TABLE "Contact" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "country" TEXT;
ALTER TABLE "Contact" ADD COLUMN "companyAddress" TEXT;
ALTER TABLE "Contact" ADD COLUMN "companyCity" TEXT;
-- Step 5: Drop old index on (tenantId, list) and create new index on (tenantId, status)
DROP INDEX IF EXISTS "Contact_tenantId_list_idx";
CREATE INDEX "Contact_tenantId_status_idx" ON "Contact"("tenantId", "status");

-- Step 6: Add index on (tenantId, accountOwnerId)
CREATE INDEX "Contact_tenantId_accountOwnerId_idx" ON "Contact"("tenantId", "accountOwnerId");

-- Step 7: Add foreign key for accountOwnerId → User
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountOwnerId_fkey" FOREIGN KEY ("accountOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
