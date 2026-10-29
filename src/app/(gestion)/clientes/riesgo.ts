"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes, riesgoCliente } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { datosFormulario, erroresDeZod, type EstadoFormulario } from "@/lib/formularios";

const esquema = z.object({
  riesgo: z.enum(riesgoCliente.enumValues),
  riesgoNota: z.string().max(500).optional(),
  diasCredito: z.coerce.number("Días no válidos.").int("Días enteros.").min(0).max(3650).optional(),
});

/** Cambia el riesgo de cobro y el plazo de pago de un cliente. */
export async function actualizarRiesgo(clienteId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);
  const valores = {
    riesgo: datos.data.riesgo,
    riesgoNota: datos.data.riesgoNota ?? null,
    diasCredito: datos.data.diasCredito ?? null,
    riesgoActualizado: new Date(),
  };
  await db.update(clientes).set(valores).where(eq(clientes.id, clienteId));
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "cliente_riesgo", entidadId: clienteId, detalle: valores });
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/cobranza");
  revalidatePath("/clientes");
  return { ok: true };
}
