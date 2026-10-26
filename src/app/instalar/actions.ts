"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { hashPassword, iniciarSesion } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  campoEmailOpcional,
  campoUsuario,
  datosFormulario,
  erroresDeZod,
  type EstadoFormulario,
} from "@/lib/formularios";

/** Solo se puede instalar si no hay usuarios y se conoce la clave INSTALACION_TOKEN. */
export async function hayUsuarios() {
  const [{ n }] = await db.select({ n: count() }).from(usuarios);
  return n > 0;
}

function tokenValido(token: string | undefined) {
  const esperado = process.env.INSTALACION_TOKEN;
  if (!esperado || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esquema = z.object({
  token: z.string("Escribe la clave de instalación."),
  nombre: z.string("Escribe tu nombre.").max(120),
  usuario: campoUsuario,
  email: campoEmailOpcional,
  password: z.string("Escribe una contraseña.").min(12, "Mínimo 12 caracteres."),
});

export async function instalar(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  if (await hayUsuarios()) redirect("/login");
  const datos = esquema.safeParse(datosFormulario(formData));
  if (!datos.success) return erroresDeZod(datos.error);
  if (!tokenValido(datos.data.token)) return { errores: { token: "Clave de instalación incorrecta." } };

  const [admin] = await db
    .insert(usuarios)
    .values({
      nombre: datos.data.nombre,
      usuario: datos.data.usuario,
      email: datos.data.email ?? null,
      passwordHash: await hashPassword(datos.data.password),
      rol: "admin",
    })
    .returning({ id: usuarios.id });
  await registrarAuditoria({ usuarioId: admin.id, accion: "crear", entidad: "usuario", entidadId: admin.id, detalle: { instalacion: true } });
  await iniciarSesion(admin.id);
  redirect("/");
}
