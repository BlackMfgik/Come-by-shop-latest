// src/routes/products.ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { products } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

// Порожній рядок з форми = поле не задано (для image — очистити зображення)
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const productFields = {
  name: z.string().trim().min(1).max(255),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  weight: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  // Фронтенд надсилає число, decimal у БД очікує рядок
  price: z
    .union([z.number().nonnegative().finite(), z.string()])
    .transform((v) => (typeof v === "number" ? v.toFixed(2) : v.trim()))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Невірний формат ціни")),
  image: z.preprocess(emptyToNull, z.string().url().nullable().optional()),
  category: z.string().trim().min(1).max(100),
};

const createProductSchema = z.object({
  ...productFields,
  hidden: z.boolean().default(false),
});

const updateProductSchema = z
  .object({ ...productFields, hidden: z.boolean() })
  .partial();

const toggleHiddenSchema = z.object({
  hidden: z.boolean(),
});

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

// ─── Хелпер: нормалізація decimal/date полів ─────────────────────────────────

function normalizeProduct(p: {
  id: number;
  name: string;
  description: string | null;
  weight: string | null;
  price: string;
  image: string | null;
  category: string;
  hidden: boolean;
  createdAt: Date;
}) {
  return { ...p, price: Number(p.price) };
}

// Адмін бачить і приховані товари, щоб мати змогу знову їх показати
async function isAdminRequest(request: FastifyRequest): Promise<boolean> {
  if (!request.headers.authorization) return false;
  try {
    await request.jwtVerify();
    return (request.user as { admin?: boolean }).admin === true;
  } catch {
    return false;
  }
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/products ──────────────────────────────────────────────────────
  fastify.get("/", async (request, reply) => {
    const isAdmin = await isAdminRequest(request);
    const rows = await db
      .select()
      .from(products)
      .where(isAdmin ? undefined : eq(products.hidden, false))
      .orderBy(asc(products.createdAt));

    return reply.send(rows.map(normalizeProduct));
  });

  // ── GET /api/products/:id ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Невірний ID" });
    }
    const { id } = parsed.data;

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      return reply.code(404).send({ error: "Товар не знайдено" });
    }

    return reply.send(normalizeProduct(product));
  });

  // ── GET /api/categories ────────────────────────────────────────────────────
  fastify.get("/categories", async (_request, reply) => {
    const rows = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(eq(products.hidden, false))
      .orderBy(asc(products.category));

    const categories = rows.map((r) => r.category);
    return reply.send(categories);
  });

  // ── POST /api/products (admin) ─────────────────────────────────────────────
  fastify.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const result = createProductSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Невірні дані товару" });
    }

    const [product] = await db
      .insert(products)
      .values({
        name: result.data.name,
        description: result.data.description,
        weight: result.data.weight,
        price: result.data.price,
        image: result.data.image,
        category: result.data.category,
        hidden: result.data.hidden,
      })
      .returning();

    if (!product) {
      return reply.code(500).send({ error: "Помилка створення товару" });
    }

    return reply.code(201).send(normalizeProduct(product));
  });

  // ── PUT /api/products/:id (admin) ──────────────────────────────────────────
  fastify.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Невірний ID" });
      }
      const { id } = parsed.data;

      const result = updateProductSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані товару" });
      }

      const data = result.data;
      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: "Нічого оновлювати" });
      }

      const [product] = await db
        .update(products)
        .set(data)
        .where(eq(products.id, id))
        .returning();

      if (!product) {
        return reply.code(404).send({ error: "Товар не знайдено" });
      }

      return reply.send(normalizeProduct(product));
    },
  );

  // ── PATCH /api/products/:id (admin) — toggle hidden ───────────────────────
  fastify.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Невірний ID" });
      }
      const { id } = parsed.data;

      const result = toggleHiddenSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }

      const [product] = await db
        .update(products)
        .set({ hidden: result.data.hidden })
        .where(eq(products.id, id))
        .returning();

      if (!product) {
        return reply.code(404).send({ error: "Товар не знайдено" });
      }

      return reply.send(normalizeProduct(product));
    },
  );

  // ── DELETE /api/products/:id (admin) ──────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Невірний ID" });
      }
      const { id } = parsed.data;

      const result = await db
        .delete(products)
        .where(eq(products.id, id))
        .returning({ id: products.id });

      if (result.length === 0) {
        return reply.code(404).send({ error: "Товар не знайдено" });
      }

      return reply.code(204).send();
    },
  );
}
