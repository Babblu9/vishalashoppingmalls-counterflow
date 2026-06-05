-- AlterTable: Add mobile number for due created, and full details for due collected
ALTER TABLE "ReportEntry" ADD COLUMN "dueBillMobile" TEXT;
ALTER TABLE "ReportEntry" ADD COLUMN "collectedDueBillNo" TEXT;
ALTER TABLE "ReportEntry" ADD COLUMN "collectedDueBillName" TEXT;
ALTER TABLE "ReportEntry" ADD COLUMN "collectedDueBillMobile" TEXT;
