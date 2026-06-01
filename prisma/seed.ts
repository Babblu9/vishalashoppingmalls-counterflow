import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed process...");

  // Clean existing data
  await prisma.auditLog.deleteMany({});
  await prisma.reportEntry.deleteMany({});
  await prisma.dailyReport.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.counter.deleteMany({});
  await prisma.branch.deleteMany({});

  console.log("Database cleared.");

  // Create Branches
  const branch1 = await prisma.branch.create({
    data: { name: "Branch 1" },
  });

  const branch2 = await prisma.branch.create({
    data: { name: "Branch 2" },
  });

  console.log("Created branches: Branch 1 & Branch 2");

  // Create Counters for Branch 1 (15 counters)
  for (let i = 1; i <= 15; i++) {
    await prisma.counter.create({
      data: {
        branchId: branch1.id,
        name: `Counter ${i}`,
      },
    });
  }

  // Create Counters for Branch 2 (5 counters)
  for (let i = 1; i <= 5; i++) {
    await prisma.counter.create({
      data: {
        branchId: branch2.id,
        name: `Counter ${i}`,
      },
    });
  }

  console.log("Created 20 counters (15 for Branch 1, 5 for Branch 2)");

  // Hash passwords
  const adminPasswordHash = bcrypt.hashSync("admin123", 10);
  const superPasswordHash = bcrypt.hashSync("superadmin123", 10);

  // Create Branch 1 Admin
  await prisma.user.create({
    data: {
      username: "admin1",
      name: "Branch 1 Admin",
      role: "ADMIN",
      branchId: branch1.id,
      passwordHash: adminPasswordHash,
    },
  });

  // Create Branch 2 Admin
  await prisma.user.create({
    data: {
      username: "admin2",
      name: "Branch 2 Admin",
      role: "ADMIN",
      branchId: branch2.id,
      passwordHash: adminPasswordHash,
    },
  });

  // Create Super Admin
  await prisma.user.create({
    data: {
      username: "superadmin",
      name: "Super Admin Manager",
      role: "SUPER_ADMIN",
      branchId: null,
      passwordHash: superPasswordHash,
    },
  });

  console.log("Created users:");
  console.log("- admin1 (Branch 1 Admin) - password: admin123");
  console.log("- admin2 (Branch 2 Admin) - password: admin123");
  console.log("- superadmin (Super Admin) - password: superadmin123");
  console.log("Seed process completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
