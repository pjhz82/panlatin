"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ejecutivos } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { datosFormulario, erroresDeZod, esDuplicado, type EstadoFormulario } from "@/lib/formularios";

const esquema = z.object({
  codigo: z
    .string("Escribe el código.")
    .max(20)
    .transform((c) => c.toUpperCase()),
  nombre: z.string("Escribe el nombre.").max(120),
  activo: z.literal("on").optional(),
});

export async function guardarEjecutivo(
  id: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const esNuevo = id === null;
  const valores = {
    codigo: datos.data.codigo,
    nombre: datos.data.nombre,
    activo: datos.data.activo === "on",
  };
  try {
    if (id) {
      await db.update(ejecutivos).set(valores).where(eq(ejecutivos.id, id));
    } else {
      [{ id }] = await db.insert(ejecutivos).values(valores).returning({ id: ejecutivos.id });
    }
  } catch (e) {
    if (esDuplicado(e)) return { errores: { codigo: "Ya existe un ejecutivo con ese código." } };
    throw e;
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: esNuevo ? "crear" : "editar",
    entidad: "ejecutivo",
    entidadId: id,
    detalle: valores,
  });
  revalidatePath("/ejecutivos");
  redirect("/ejecutivos");
}
