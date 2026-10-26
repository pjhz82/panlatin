"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sesiones, usuarios } from "@/db/schema";
import { COOKIE_SESION, hashPassword, obtenerUsuario, verificarPassword } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erroresDeZod, type EstadoFormulario } from "@/lib/formularios";

const esquema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual."),
    password: z.string().min(12, "Mínimo 12 caracteres."),
    repetir: z.string(),
  })
  .refine((d) => d.password === d.repetir, { path: ["repetir"], message: "No coincide con la nueva." })
  .refine((d) => d.password !== d.actual, { path: ["password"], message: "Debe ser distinta de la actual." });

export async function cambiarClave(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");
  const datos = esquema.safeParse({
    actual: String(formData.get("actual") ?? ""),
    password: String(formData.get("password") ?? ""),
    repetir: String(formData.get("repetir") ?? ""),
  });
  if (!datos.success) return erroresDeZod(datos.error);

  const [fila] = await db.select({ hash: usuarios.passwordHash }).from(usuarios).where(eq(usuarios.id, usuario.id));
  if (!(await verificarPassword(datos.data.actual, fila.hash))) {
    return { errores: { actual: "La contraseña actual no es correcta." } };
  }
  await db
    .update(usuarios)
    .set({ passwordHash: await hashPassword(datos.data.password), debeCambiarPassword: false })
    .where(eq(usuarios.id, usuario.id));
  // Cierra las demás sesiones abiertas de este usuario.
  const token = (await cookies()).get(COOKIE_SESION)?.value ?? "";
  await db
    .delete(sesiones)
    .where(and(eq(sesiones.usuarioId, usuario.id), ne(sesiones.id, createHash("sha256").update(token).digest("hex"))));
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "usuario", entidadId: usuario.id, detalle: { cambioPassword: true } });
  redirect(usuario.rol === "cliente" ? "/portal" : "/");
}
