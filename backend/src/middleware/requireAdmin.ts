// src/middleware/requireAdmin.ts
import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

interface JwtPayload {
  id: number;
  email: string;
  admin: boolean;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "Необхідна авторизація" });
    return;
  }

  const payload = request.user as JwtPayload;
  if (!payload.admin) {
    await reply.code(403).send({ error: "Доступ заборонено" });
    return;
  }

  // JWT живе 30 днів — права адміна перевіряємо в БД, щоб відкликання діяло одразу
  const [user] = await db
    .select({ admin: users.admin })
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);

  if (!user?.admin) {
    await reply.code(403).send({ error: "Доступ заборонено" });
  }
}
