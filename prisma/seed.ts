import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data
  await prisma.auditLog.deleteMany({});
  await prisma.reportEntry.deleteMany({});
  await prisma.dailyReport.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.counter.deleteMany({});
  await prisma.branch.deleteMany({});

  // Create Branches
  const branch1 = await prisma.branch.create({
    data: { name: "Siddipet" },
  });

  const branch2 = await prisma.branch.create({
    data: { name: "Siricilla" },
  });

  // Create Counters for Branch 1 (15 counters)
  for (let i = 1; i <= 15; i++) {
    await prisma.counter.create({
      data: {
        branchId: branch1.id,
        name: `Counter ${i}`,
      },
    });
  }

  // Create Counters for Branch 2 (8 counters)
  for (let i = 1; i <= 8; i++) {
    await prisma.counter.create({
      data: {
        branchId: branch2.id,
        name: `Counter ${i}`,
      },
    });
  }

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
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
