import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import {
  ingredient,
  purchaseOrder,
  purchaseOrderItem,
} from "@/lib/db/schema";
import { purchaseOrderInput } from "@/lib/validators";

function toCents(dollars: number | undefined): number {
  return dollars === undefined ? 0 : Math.round(dollars * 100);
}

interface NormalLine {
  ingredientId: string;
  qty: number;
  unitCostCents: number;
}
/** De-dupe by ingredient (unique constraint), drop zero-qty rows. */
function normalizeLines(
  lines: { ingredientId: string; qty: number; unitCost?: number }[],
): NormalLine[] {
  const byId = new Map<string, NormalLine>();
  for (const l of lines ?? []) {
    if (l.qty > 0)
      byId.set(l.ingredientId, {
        ingredientId: l.ingredientId,
        qty: l.qty,
        unitCostCents: toCents(l.unitCost),
      });
  }
  return [...byId.values()];
}

async function assertIngredientsOwned(accountId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await getDb()
    .select({ id: ingredient.id })
    .from(ingredient)
    .where(
      and(eq(ingredient.accountId, accountId), inArray(ingredient.id, ids)),
    );
  if (rows.length !== ids.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more ingredients are not in this account.",
    });
  }
}

async function loadOrder(accountId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(purchaseOrder)
    .where(
      and(eq(purchaseOrder.id, id), eq(purchaseOrder.accountId, accountId)),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export const purchasingRouter = createTRPCRouter({
  /** Orders with item count + total cost (cents). */
  list: opsProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select({
          id: purchaseOrder.id,
          supplierName: purchaseOrder.supplierName,
          status: purchaseOrder.status,
          createdAt: purchaseOrder.createdAt,
          archivedAt: purchaseOrder.archivedAt,
          itemCount: sql<number>`count(${purchaseOrderItem.id})::int`,
          totalCents: sql<number>`coalesce(round(sum(${purchaseOrderItem.qty} * ${purchaseOrderItem.unitCostCents}))::int, 0)`,
        })
        .from(purchaseOrder)
        .leftJoin(
          purchaseOrderItem,
          eq(purchaseOrderItem.purchaseOrderId, purchaseOrder.id),
        )
        .where(eq(purchaseOrder.accountId, ctx.account.accountId))
        .groupBy(purchaseOrder.id)
        .orderBy(desc(purchaseOrder.createdAt));
      const mapped = rows.map((r) => ({
        ...r,
        itemCount: Number(r.itemCount),
        totalCents: Number(r.totalCents),
      }));
      return input?.includeArchived
        ? mapped
        : mapped.filter((r) => r.archivedAt === null);
    }),

  byId: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await loadOrder(ctx.account.accountId, input.id);
      const lines = await getDb()
        .select({
          id: purchaseOrderItem.id,
          ingredientId: purchaseOrderItem.ingredientId,
          qty: purchaseOrderItem.qty,
          unitCostCents: purchaseOrderItem.unitCostCents,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
        })
        .from(purchaseOrderItem)
        .innerJoin(
          ingredient,
          eq(ingredient.id, purchaseOrderItem.ingredientId),
        )
        .where(eq(purchaseOrderItem.purchaseOrderId, order.id))
        .orderBy(asc(ingredient.name));
      const priced = lines.map((l) => ({
        ...l,
        lineCostCents: Math.round(l.qty * l.unitCostCents),
      }));
      const totalCents = priced.reduce((s, l) => s + l.lineCostCents, 0);
      return { ...order, lines: priced, totalCents };
    }),

  create: opsProcedure
    .input(purchaseOrderInput)
    .mutation(async ({ ctx, input }) => {
      const lines = normalizeLines(input.lines);
      await assertIngredientsOwned(
        ctx.account.accountId,
        lines.map((l) => l.ingredientId),
      );
      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .insert(purchaseOrder)
          .values({
            accountId: ctx.account.accountId,
            truckId: input.truckId ?? null,
            supplierName: input.supplierName,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (lines.length > 0) {
          await tx.insert(purchaseOrderItem).values(
            lines.map((l) => ({
              accountId: ctx.account.accountId,
              purchaseOrderId: row.id,
              ingredientId: l.ingredientId,
              qty: l.qty,
              unitCostCents: l.unitCostCents,
            })),
          );
        }
        return row;
      });
    }),

  update: opsProcedure
    .input(z.object({ id: z.string().uuid(), data: purchaseOrderInput }))
    .mutation(async ({ ctx, input }) => {
      const order = await loadOrder(ctx.account.accountId, input.id);
      if (order.status === "received") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A received order can't be edited.",
        });
      }
      const lines = normalizeLines(input.data.lines);
      await assertIngredientsOwned(
        ctx.account.accountId,
        lines.map((l) => l.ingredientId),
      );
      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .update(purchaseOrder)
          .set({
            truckId: input.data.truckId ?? null,
            supplierName: input.data.supplierName,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrder.id, input.id))
          .returning();
        await tx
          .delete(purchaseOrderItem)
          .where(eq(purchaseOrderItem.purchaseOrderId, input.id));
        if (lines.length > 0) {
          await tx.insert(purchaseOrderItem).values(
            lines.map((l) => ({
              accountId: ctx.account.accountId,
              purchaseOrderId: input.id,
              ingredientId: l.ingredientId,
              qty: l.qty,
              unitCostCents: l.unitCostCents,
            })),
          );
        }
        return row;
      });
    }),

  /**
   * Status transition. Receiving (→ received) bumps ingredient on-hand once,
   * inside the same transaction; the receivedAt guard makes it idempotent.
   */
  setStatus: opsProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["draft", "ordered", "received", "canceled"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const order = await loadOrder(ctx.account.accountId, input.id);

      // Receiving for the first time → add the ordered quantities to stock.
      if (input.status === "received" && order.receivedAt === null) {
        return getDb().transaction(async (tx) => {
          const items = await tx
            .select({
              ingredientId: purchaseOrderItem.ingredientId,
              qty: purchaseOrderItem.qty,
            })
            .from(purchaseOrderItem)
            .where(eq(purchaseOrderItem.purchaseOrderId, order.id));
          for (const it of items) {
            await tx
              .update(ingredient)
              .set({
                onHandQty: sql`${ingredient.onHandQty} + ${it.qty}`,
                updatedAt: new Date(),
              })
              .where(eq(ingredient.id, it.ingredientId));
          }
          const [row] = await tx
            .update(purchaseOrder)
            .set({
              status: "received",
              receivedAt: new Date(),
              orderedAt: order.orderedAt ?? new Date(),
              updatedAt: new Date(),
            })
            .where(eq(purchaseOrder.id, order.id))
            .returning();
          return row;
        });
      }

      const [row] = await getDb()
        .update(purchaseOrder)
        .set({
          status: input.status,
          orderedAt:
            input.status === "ordered" && order.orderedAt === null
              ? new Date()
              : order.orderedAt,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrder.id, order.id))
        .returning();
      return row;
    }),

  /** Seed a draft order from every below-par ingredient. */
  createFromLowStock: opsProcedure.mutation(async ({ ctx }) => {
    const low = await getDb()
      .select()
      .from(ingredient)
      .where(
        and(
          eq(ingredient.accountId, ctx.account.accountId),
          isNull(ingredient.archivedAt),
          sql`${ingredient.parLevel} is not null and ${ingredient.onHandQty} <= ${ingredient.parLevel}`,
        ),
      );
    if (low.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nothing is below its reorder point right now.",
      });
    }
    const lines: NormalLine[] = low.map((i) => {
      const target = i.reorderToQty ?? i.parLevel ?? 0;
      const qty = Math.max(0, target - i.onHandQty);
      return {
        ingredientId: i.id,
        qty: qty > 0 ? qty : 1,
        unitCostCents: i.unitCostCents,
      };
    });
    return getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(purchaseOrder)
        .values({
          accountId: ctx.account.accountId,
          notes: "Auto-generated from low stock",
          createdByUserId: ctx.account.userId,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await tx.insert(purchaseOrderItem).values(
        lines.map((l) => ({
          accountId: ctx.account.accountId,
          purchaseOrderId: row.id,
          ingredientId: l.ingredientId,
          qty: l.qty,
          unitCostCents: l.unitCostCents,
        })),
      );
      return row;
    });
  }),

  archive: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await loadOrder(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(purchaseOrder)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrder.id, input.id))
        .returning();
      return row;
    }),
});
