"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cuentas, moneda, redBlockchain, tipoCuenta } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { datosFormulario, erroresDeZod, esDuplicado, type EstadoFormulario } from "@/lib/formularios";

const esquema = z
  .object({
    nombre: z.string("Escribe un nombre para la cuenta.").max(120),
    tipo: z.enum(tipoCuenta.enumValues, "Elige el tipo."),
    moneda: z.enum(moneda.enumValues, "Elige la moneda."),
    empresaId: z.coerce.number().int().positive().optional(),
    entidad: z.string().max(80).optional(),
    numero: z.string().max(40).optional(),
    red: z.enum(redBlockchain.enumValues).optional(),
    direccion: z.string().max(120).optional(),
    activa: z.literal("on").optional(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === "banco") {
      if (!c.empresaId) ctx.addIssue({ code: "custom", path: ["empresaId"], message: "Elige la empresa titular." });
      if (!c.entidad) ctx.addIssue({ code: "custom", path: ["entidad"], message: "Escribe el banco." });
    }
    if (c.tipo === "wallet") {
      if (!c.red) ctx.addIssue({ code: "custom", path: ["red"], message: "Elige la red." });
      if (!c.direccion) ctx.addIssue({ code: "custom", path: ["direccion"], message: "Escribe la dirección." });
      if (c.moneda !== "USDT" && c.moneda !== "USDC") {
        ctx.addIssue({ code: "custom", path: ["moneda"], message: "Una wallet es de USDT o USDC." });
      }
      if (c.red === "TRON" && c.direccion && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(c.direccion)) {
        ctx.addIssue({ code: "custom", path: ["direccion"], message: "No parece una dirección TRON válida." });
      }
      if (c.red === "ETH" && c.direccion && !/^0x[0-9a-fA-F]{40}$/.test(c.direccion)) {
        ctx.addIssue({ code: "custom", path: ["direccion"], message: "No parece una dirección Ethereum válida." });
      }
    }
    if (c.tipo === "exchange" && !c.entidad) {
      ctx.addIssue({ code: "custom", path: ["entidad"], message: "Escribe el exchange." });
    }
  });

export async function guardarCuenta(
  id: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const c = datos.data;
  const esWallet = c.tipo === "wallet";
  const esNueva = id === null;
  const valores = {
    nombre: c.nombre,
    tipo: c.tipo,
    moneda: c.moneda,
    empresaId: c.empresaId ?? null,
    entidad: esWallet ? null : (c.entidad ?? null),
    numero: c.tipo === "banco" ? (c.numero ?? null) : null,
    red: esWallet ? c.red! : null,
    direccion: esWallet ? c.direccion! : null,
    activa: esNueva || c.activa === "on",
  };
  try {
    if (id) {
      await db.update(cuentas).set(valores).where(eq(cuentas.id, id));
    } else {
      [{ id }] = await db.insert(cuentas).values(valores).returning({ id: cuentas.id });
    }
  } catch (e) {
    if (esDuplicado(e)) {
      return { error: "Ya existe una cuenta con ese nombre o esa dirección de wallet." };
    }
    throw e;
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: esNueva ? "crear" : "editar",
    entidad: "cuenta",
    entidadId: id,
    detalle: valores,
  });
  revalidatePath("/cuentas");
  redirect("/cuentas");
}
