import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is not set. " +
    "Set it in your .env file or deployment environment. " +
    "Example: JWT_SECRET=your-long-random-secret-here"
  );
}

export interface SessionPayload {
  userId: string;
  username: string;
  name: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
}

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "1d" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch (e) {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 1 day
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
}
