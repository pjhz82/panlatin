"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cuentas, operaciones, partidas, subcuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { firmaDelCreador } from "@/lib/ejecucion";
import { datosFormulario, type EstadoFormulario } from "@/lib/formularios";

/** Acepta 1.234,56 o 1234.56 */
const importe = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) : 0))
  .pipe(z.number("Importe no válido.").nonnegative("El importe no puede ser negativo."));

const esquema = z.object({
  fecha: z.iso.date("Pon la fecha."),
  concepto: z.string("Escribe el concepto.").max(200),
  pagadoA: z.string().max(300).optional(),
  cuentaId: z.coerce.number().int().positive().optional(),
  tasa: importe,
  cargo: importe,
  abono: importe,
  referencia: z.string().max(200).optional(),
});

/**
 * Registra una fila en la hoja del cliente, como en el Excel. Crea una
 * operación de una sola partida que necesita las dos firmas y se ejecuta sola
 * al aprobarse, con la fecha indicada.
 */
export async function registrarEnHoja(subcuentaId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Revisa los datos." };
  const d = datos.data;
  if ((d.cargo > 0) === (d.abono > 0)) return { error: "Pon un importe en Cargo o en Abono (solo uno)." };

  const [sub] = await db.select({ id: subcuentas.id }).from(subcuentas).where(eq(subcuentas.id, subcuentaId));
  if (!sub) return { error: "No existe la subcuenta." };

  const efecto = d.abono - d.cargo; // + abono / − cargo, en US$
  let importeCuenta = 0;
  if (d.cuentaId) {
    const [c] = await db.select({ moneda: cuentas.moneda, activa: cuentas.activa }).from(cuentas).where(eq(cuentas.id, d.cuentaId));
    if (!c?.activa) return { error: "La cuenta elegida no existe o está inactiva." };
    if (c.moneda === "BS" && !d.tasa) return { error: "La forma de pago es en Bs.: pon la tasa." };
    // Si el cliente nos paga (abono), entra en la cuenta; si le pagamos (cargo), sale.
    importeCuenta = c.moneda === "BS" ? Math.round(efecto * d.tasa * 100) / 100 : efecto;
  }

  const id = await db.transaction(async (tx) => {
    const [op] = await tx
      .insert(operaciones)
      .values({
        tipo: efecto > 0 ? "cobro" : "pago",
        fecha: d.fecha,
        subcuentaId,
        descripcion: d.pagadoA ?? null,
        montoUsd: String(Math.abs(efecto)),
        tasa: d.tasa ? String(d.tasa) : null,
        montoBs: d.tasa ? String(Math.round(Math.abs(efecto) * d.tasa * 100) / 100) : null,
        creadoPor: usuario.id,
        ejecutarAlAprobar: true,
      })
      .returning({ id: operaciones.id });
    await tx.insert(partidas).values({
      operacionId: op.id,
      orden: 1,
      descripcion: d.concepto,
      cuentaId: d.cuentaId ?? null,
      importeCuenta: String(importeCuenta),
      efectoCliente: String(efecto),
      referencia: d.referencia ?? null,
    });
    await firmaDelCreador(tx, op.id, usuario);
    return op.id;
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "operacion", entidadId: id, detalle: { desdeHoja: subcuentaId, ...d } });
  revalidatePath(`/subcuentas/${subcuentaId}`);
  revalidatePath("/operaciones");
  return { ok: true };
}
