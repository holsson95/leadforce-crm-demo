-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "corporatePhoneDigits" TEXT,
ADD COLUMN     "mobilePhoneDigits" TEXT;

-- CreateIndex
CREATE INDEX "Contact_tenantId_mobilePhoneDigits_idx" ON "Contact"("tenantId", "mobilePhoneDigits");

-- CreateIndex
CREATE INDEX "Contact_tenantId_corporatePhoneDigits_idx" ON "Contact"("tenantId", "corporatePhoneDigits");

-- Backfill mobilePhoneDigits / corporatePhoneDigits for existing rows,
-- using the same normalization as src/lib/utils/phone.ts.
UPDATE "Contact"
SET "mobilePhoneDigits" = (
  CASE
    WHEN length(regexp_replace("mobilePhone", '\D', '', 'g')) = 11
     AND left(regexp_replace("mobilePhone", '\D', '', 'g'), 1) = '1'
    THEN substring(regexp_replace("mobilePhone", '\D', '', 'g') from 2)
    ELSE nullif(regexp_replace("mobilePhone", '\D', '', 'g'), '')
  END
)
WHERE "mobilePhone" IS NOT NULL;

UPDATE "Contact"
SET "corporatePhoneDigits" = (
  CASE
    WHEN length(regexp_replace("corporatePhone", '\D', '', 'g')) = 11
     AND left(regexp_replace("corporatePhone", '\D', '', 'g'), 1) = '1'
    THEN substring(regexp_replace("corporatePhone", '\D', '', 'g') from 2)
    ELSE nullif(regexp_replace("corporatePhone", '\D', '', 'g'), '')
  END
)
WHERE "corporatePhone" IS NOT NULL;
