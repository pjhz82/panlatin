"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rolUsuario, sesiones, usuarios } from "@/db/schema";
import { hashPassword, requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  campoEmailOpcional,
  campoUsuario,
  datosFormulario,
  erroresDeZod,
  esDuplicado,
  type EstadoFormulario,
} from "@/lib/formularios";

const esquema = z
  .object({
    nombre: z.string("Escribe el nombre.").max(120),
    usuario: campoUsuario,
    email: campoEmailOpcional,
    rol: z.enum(rolUsuario.enumValues, "Elige el rol."),
    ejecutivoId: z.coerce.number().int().positive().optional(),
    clienteId: z.coerce.number().int().positive().optional(),
    password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").optional(),
    activo: z.literal("on").optional(),
  })
  .superRefine((u, ctx) => {
    if (u.rol === "ejecutivo" && !u.ejecutivoId) {
      ctx.addIssue({ code: "custom", path: ["ejecutivoId"], message: "Elige qué ejecutivo es." });
    }
    if (u.rol === "cliente" && !u.clienteId) {
      ctx.addIssue({ code: "custom", path: ["clienteId"], message: "Elige el cliente." });
    }
  });

export async function guardarUsuario(
  id: number | null,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const admin = await requerirUsuario(["admin"]);
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);

  const u = datos.data;
  const esNuevo = id === null;
  if (esNuevo && !u.password) {
    return { errores: { password: "Pon una contraseña inicial." } };
  }
  const activo = esNuevo || u.activo === "on";
  if (id === admin.id && (!activo || u.rol !== "admin")) {
    return { error: "No puedes quitarte el rol de administrador ni desactivarte a ti mismo." };
  }

  const valores = {
    nombre: u.nombre,
    usuario: u.usuario,
    email: u.email ?? null,
    rol: u.rol,
    ejecutivoId: u.rol === "ejecutivo" ? u.ejecutivoId! : null,
    clienteId: u.rol === "cliente" ? u.clienteId! : null,
    activo,
    ...(u.password ? { passwordHash: await hashPassword(u.password) } : {}),
  };
  try {
    if (id) {
      await db.update(usuarios).set(valores).where(eq(usuarios.id, id));
      // Si cambió la contraseña o se desactivó, se cierran sus sesiones abiertas.
      if (u.password || !activo) await db.delete(sesiones).where(eq(sesiones.usuarioId, id));
    } else {
      [{ id }] = await db
        .insert(usuarios)
        .values({ ...valores, passwordHash: valores.passwordHash! })
        .returning({ id: usuarios.id });
    }
  } catch (e) {
    if (esDuplicado(e)) {
      return { error: "Ya existe otro usuario con ese nombre de usuario o ese correo." };
    }
    throw e;
  }
  await registrarAuditoria({
    usuarioId: admin.id,
    accion: esNuevo ? "crear" : "editar",
    entidad: "usuario",
    entidadId: id,
    detalle: {
      nombre: valores.nombre,
      usuario: valores.usuario,
      email: valores.email,
      rol: valores.rol,
      ejecutivoId: valores.ejecutivoId,
      clienteId: valores.clienteId,
      activo: valores.activo,
      cambioPassword: Boolean(u.password),
    },
  });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}
