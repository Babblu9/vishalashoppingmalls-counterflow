-- AlterTable: add manuallyCollected payment mode column to ReportEntry
ALTER TABLE "ReportEntry" ADD COLUMN "manuallyCollected" DOUBLE PRECISION NOT NULL DEFAULT 0;
