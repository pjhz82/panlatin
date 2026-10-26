"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { datosFormulario, erroresDeZod, esDuplicado, type EstadoFormulario } from "@/lib/formularios";

const esquema = z.object({
  nombre: z.string("Escribe el nombre.").max(120),
  pais: z.string().max(80).optional(),
  activa: z.literal("on").optional(),
});

export async function guardarEmpresa(
  id: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const esNueva = id === null;
  const valores = {
    nombre: datos.data.nombre,
    pais: datos.data.pais ?? null,
    activa: datos.data.activa === "on",
  };
  try {
    if (id) {
      await db.update(empresas).set(valores).where(eq(empresas.id, id));
    } else {
      [{ id }] = await db.insert(empresas).values(valores).returning({ id: empresas.id });
    }
  } catch (e) {
    if (esDuplicado(e)) return { errores: { nombre: "Ya existe una empresa con ese nombre." } };
    throw e;
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: esNueva ? "crear" : "editar",
    entidad: "empresa",
    entidadId: id,
    detalle: valores,
  });
  revalidatePath("/empresas");
  redirect("/empresas");
}
