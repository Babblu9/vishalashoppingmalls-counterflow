-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Counter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "cash" REAL NOT NULL DEFAULT 0,
    "gpay" REAL NOT NULL DEFAULT 0,
    "card" REAL NOT NULL DEFAULT 0,
    "upi" REAL NOT NULL DEFAULT 0,
    "others" REAL NOT NULL DEFAULT 0,
    "totalDue" REAL NOT NULL DEFAULT 0,
    "collectedDue" REAL NOT NULL DEFAULT 0,
    "manualTotal" REAL NOT NULL DEFAULT 0,
    "systemTotal" REAL NOT NULL DEFAULT 0,
    "difference" REAL NOT NULL DEFAULT 0,
    "grandTotal" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportEntry_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reportEntryId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_reportEntryId_fkey" FOREIGN KEY ("reportEntryId") REFERENCES "ReportEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_branchId_name_key" ON "Counter"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_branchId_businessDate_key" ON "DailyReport"("branchId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntry_reportId_counterId_key" ON "ReportEntry"("reportId", "counterId");
