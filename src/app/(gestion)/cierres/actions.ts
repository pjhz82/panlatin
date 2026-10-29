"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cierres } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularBalance } from "@/lib/balance";
import { balancesDiarios } from "@/lib/cierres";
import type { EstadoFormulario } from "@/lib/formularios";

const fecha = z.iso.date("Fecha no válida.");
const tasa = z
  .string()
  .optional()
  // Acepta 1.013,03 o 1013.03: el punto solo es separador de miles si hay coma decimal.
  .transform((v) => (v ? Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) : NaN))
  .pipe(z.number("Escribe la tasa del día (Bs. por US$).").positive("Escribe la tasa del día (Bs. por US$)."));

/** Guarda (o reemplaza) el cierre de un día con el balance a esa fecha. */
export async function guardarCierre(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = z
    .object({ corte: fecha, tasa, notas: z.string().max(500).optional() })
    .safeParse({
      corte: String(formData.get("corte") ?? ""),
      tasa: String(formData.get("tasa") ?? "").replace(/\s/g, "") || undefined,
      notas: String(formData.get("notas") ?? "").trim() || undefined,
    });
  if (!datos.success) return { error: datos.error.issues[0].message };
  const { corte, notas } = datos.data;
  if (corte > new Date().toISOString().slice(0, 10)) return { error: "No se puede cerrar un día futuro." };

  const b = await calcularBalance({ usuario, corte, tasa: datos.data.tasa });
  const valores = {
    fecha: corte,
    tasa: String(datos.data.tasa),
    disponibleUsd: String(b.disponibleUsd),
    bancosBs: String(b.totalBs),
    bsEnUsd: String(b.bsEnUsd),
    porCobrar: String(b.porCobrar),
    provisionIncobrables: String(b.provisionIncobrables),
    porPagar: String(b.porPagar),
    patrimonio: String(b.patrimonio),
    detalle: {
      cuentas: Object.values(b.grupos)
        .flat()
        .map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, saldo: Math.round(c.saldo * 100) / 100 })),
      altoRiesgo: b.altoRiesgo,
      deudores: b.deudores.length,
      acreedores: b.acreedores.length,
    },
    notas: notas ?? null,
    tipo: "manual",
    creadoPor: usuario.id,
    creadoEn: new Date(),
  };
  await db.insert(cierres).values(valores).onConflictDoUpdate({ target: cierres.fecha, set: valores });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "cierre", detalle: { fecha: corte, patrimonio: b.patrimonio } });
  revalidatePath("/cierres");
  revalidatePath("/balance");
  return { ok: true };
}

/**
 * Calcula y guarda los cierres de días pasados que no tengan cierre guardado a
 * mano, con una misma tasa para todos (máximo 400 días por vez).
 */
export async function calcularCierresPasados(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin"]);
  const datos = z
    .object({ desde: fecha, hasta: fecha, tasa })
    .safeParse({
      desde: String(formData.get("desde") ?? ""),
      hasta: String(formData.get("hasta") ?? ""),
      tasa: String(formData.get("tasa") ?? "").replace(/\s/g, "") || undefined,
    });
  if (!datos.success) return { error: datos.error.issues[0].message };
  const { desde, hasta } = datos.data;
  const hoy = new Date().toISOString().slice(0, 10);
  if (desde > hasta) return { error: "«Desde» debe ser anterior a «hasta»." };
  if (hasta > hoy) return { error: "No se calculan días futuros." };
  if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > 400) return { error: "Máximo 400 días por vez." };

  const dias = await balancesDiarios(desde, hasta, datos.data.tasa);
  await db.transaction(async (tx) => {
    // Los guardados a mano no se tocan; los calculados se recalculan.
    await tx.delete(cierres).where(and(eq(cierres.tipo, "calculado"), sql`${cierres.fecha} between ${desde} and ${hasta}`));
    const manuales = new Set(
      (await tx.select({ fecha: cierres.fecha }).from(cierres).where(sql`${cierres.fecha} between ${desde} and ${hasta}`)).map((c) => c.fecha),
    );
    const filas = dias
      .filter((d) => !manuales.has(d.fecha))
      .map((d) => ({
        fecha: d.fecha,
        tasa: String(datos.data.tasa),
        disponibleUsd: String(d.disponibleUsd),
        bancosBs: String(d.bancosBs),
        bsEnUsd: String(d.bsEnUsd),
        porCobrar: String(d.porCobrar),
        provisionIncobrables: String(d.provisionIncobrables),
        porPagar: String(d.porPagar),
        patrimonio: String(d.patrimonio),
        tipo: "calculado",
        creadoPor: usuario.id,
      }));
    for (let i = 0; i < filas.length; i += 500) await tx.insert(cierres).values(filas.slice(i, i + 500));
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "cierre", detalle: { calculados: { desde, hasta } } });
  revalidatePath("/cierres");
  return { ok: true };
}
