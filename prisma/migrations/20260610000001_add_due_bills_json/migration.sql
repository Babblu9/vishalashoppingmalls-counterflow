-- Add JSON array columns for multi-entry due bill support
ALTER TABLE "ReportEntry" ADD COLUMN "dueBillsJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ReportEntry" ADD COLUMN "collectedDueBillsJson" JSONB NOT NULL DEFAULT '[]';

-- Migrate existing single-entry data into array (first element)
UPDATE "ReportEntry"
SET "dueBillsJson" = jsonb_build_array(
  jsonb_build_object(
    'billNo',  COALESCE("dueBillNo", ''),
    'name',    COALESCE("dueBillName", ''),
    'amount',  "dueBillAmount",
    'mobile',  COALESCE("dueBillMobile", '')
  )
)
WHERE "dueBillNo" IS NOT NULL
   OR "dueBillName" IS NOT NULL
   OR "dueBillMobile" IS NOT NULL;

UPDATE "ReportEntry"
SET "collectedDueBillsJson" = jsonb_build_array(
  jsonb_build_object(
    'billNo',  COALESCE("collectedDueBillNo", ''),
    'name',    COALESCE("collectedDueBillName", ''),
    'mobile',  COALESCE("collectedDueBillMobile", '')
  )
)
WHERE "collectedDueBillNo" IS NOT NULL
   OR "collectedDueBillName" IS NOT NULL
   OR "collectedDueBillMobile" IS NOT NULL;
