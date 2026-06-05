/**
 * One-time script: add Counter 6, Counter 7, Counter 8 to the Siricilla branch.
 * Run with: npx ts-node --skip-project prisma/add-sircilla-counters.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find the Siricilla branch (the seed uses "Siricilla")
  const branch = await prisma.branch.findFirst({
    where: { name: { in: ["Siricilla", "Sircilla"] } },
  });

  if (!branch) {
    console.error("Siricilla/Sircilla branch not found. Check the branch name in DB.");
    process.exit(1);
  }

  console.log(`Found branch: ${branch.name} (${branch.id})`);

  // Get existing counters to avoid duplicates
  const existing = await prisma.counter.findMany({
    where: { branchId: branch.id },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((c) => c.name));
  console.log("Existing counters:", [...existingNames].join(", "));

  let added = 0;
  for (let i = 6; i <= 8; i++) {
    const name = `Counter ${i}`;
    if (existingNames.has(name)) {
      console.log(`  Skipped (already exists): ${name}`);
      continue;
    }
    await prisma.counter.create({ data: { branchId: branch.id, name } });
    console.log(`  Added: ${name}`);
    added++;
  }

  console.log(`\nDone. Added ${added} counter(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
