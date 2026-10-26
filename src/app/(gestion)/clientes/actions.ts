"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { datosFormulario, erroresDeZod, esDuplicado, type EstadoFormulario } from "@/lib/formularios";

const idOpcional = z.coerce.number().int().positive().optional();

const esquemaCliente = z.object({
  nombre: z.string("Escribe el nombre.").max(160),
  ejecutivoId: idOpcional,
  notas: z.string().max(2000).optional(),
  activo: z.literal("on").optional(),
});

export async function guardarCliente(
  id: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = esquemaCliente.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const esNuevo = id === null;
  const valores = {
    nombre: datos.data.nombre,
    ejecutivoId: datos.data.ejecutivoId ?? null,
    notas: datos.data.notas ?? null,
    activo: esNuevo || datos.data.activo === "on",
  };
  try {
    if (id) {
      await db.update(clientes).set(valores).where(eq(clientes.id, id));
    } else {
      // Todo cliente nace con una subcuenta con su mismo nombre.
      id = await db.transaction(async (tx) => {
        const [{ id: nuevoId }] = await tx.insert(clientes).values(valores).returning({ id: clientes.id });
        await tx.insert(subcuentas).values({ clienteId: nuevoId, nombre: valores.nombre });
        return nuevoId;
      });
    }
  } catch (e) {
    if (esDuplicado(e)) {
      return { errores: { nombre: "Ya existe un cliente o una subcuenta con ese nombre." } };
    }
    throw e;
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: esNuevo ? "crear" : "editar",
    entidad: "cliente",
    entidadId: id,
    detalle: valores,
  });
  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

const esquemaSubcuenta = z.object({
  nombre: z.string("Escribe el nombre de la subcuenta.").max(160),
  ejecutivoId: idOpcional,
  activa: z.literal("on").optional(),
});

export async function guardarSubcuenta(
  clienteId: number,
  subcuentaId: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = esquemaSubcuenta.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const esNueva = subcuentaId === null;
  const valores = {
    nombre: datos.data.nombre,
    ejecutivoId: datos.data.ejecutivoId ?? null,
    activa: esNueva || datos.data.activa === "on",
  };
  try {
    if (subcuentaId) {
      await db
        .update(subcuentas)
        .set(valores)
        .where(and(eq(subcuentas.id, subcuentaId), eq(subcuentas.clienteId, clienteId)));
    } else {
      [{ id: subcuentaId }] = await db
        .insert(subcuentas)
        .values({ ...valores, clienteId })
        .returning({ id: subcuentas.id });
    }
  } catch (e) {
    if (esDuplicado(e)) return { errores: { nombre: "Ya existe una subcuenta con ese nombre." } };
    throw e;
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: esNueva ? "crear" : "editar",
    entidad: "subcuenta",
    entidadId: subcuentaId,
    detalle: { ...valores, clienteId },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
