-- AlterTable
ALTER TABLE "ReportEntry" ADD COLUMN "manuallyCollectedBillsJson" JSONB NOT NULL DEFAULT '[]';
