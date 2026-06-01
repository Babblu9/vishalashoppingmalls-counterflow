import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** IST is UTC+5:30 = 330 minutes ahead of UTC */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts a UTC Date to its IST equivalent Date object.
 */
function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/**
 * Calculates the business date for a given calendar date based on the 10:00 AM IST boundary.
 * - If before 10:00 AM IST, the business date is the previous calendar day (IST).
 * - If at or after 10:00 AM IST, the business date is the current calendar day (IST).
 */
export function getBusinessDate(date = new Date()): string {
  const istDate = toIST(date);
  const hours = istDate.getUTCHours(); // use UTC on the shifted date = IST hours

  if (hours < 10) {
    istDate.setUTCDate(istDate.getUTCDate() - 1);
  }

  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(istDate.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculates the locking deadline for a given business date.
 * The deadline is 10:00 AM IST on the calendar day AFTER the business date.
 * Returns a UTC Date so it can be compared to new Date() safely.
 */
export function getBusinessDayDeadline(businessDateStr: string): Date {
  const [yyyy, mm, dd] = businessDateStr.split("-").map(Number);
  // Next calendar day at 10:00 AM IST = 10:00 AM IST = 04:30 AM UTC
  // IST offset is +5:30, so 10:00 IST = 04:30 UTC
  const nextDayUTC = Date.UTC(yyyy, mm - 1, dd + 1, 4, 30, 0, 0);
  return new Date(nextDayUTC);
}

/**
 * Checks if a business date is editable at the current time.
 * It is editable if the current time is before the business date's deadline.
 */
export function isBusinessDateEditable(businessDateStr: string, atTime = new Date()): boolean {
  const deadline = getBusinessDayDeadline(businessDateStr);
  return atTime.getTime() < deadline.getTime();
}

/**
 * Formats a currency value as Indian Rupees (INR)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
