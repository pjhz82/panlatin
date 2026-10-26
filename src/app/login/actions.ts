"use server";

import { redirect } from "next/navigation";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { cerrarSesion, iniciarSesion, obtenerUsuario, verificarPassword } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import type { EstadoFormulario } from "@/lib/formularios";

const esquema = z.object({
  identificador: z.string().min(1).transform((u) => u.toLowerCase()),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export async function entrar(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const datos = esquema.safeParse({
    identificador: String(formData.get("usuario") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!datos.success) return { error: "Escribe tu usuario y tu contraseña." };

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(or(eq(usuarios.usuario, datos.data.identificador), eq(usuarios.email, datos.data.identificador)))
    .limit(1);

  const valido =
    usuario?.activo && (await verificarPassword(datos.data.password, usuario.passwordHash));
  if (!usuario || !valido) {
    await registrarAuditoria({
      usuarioId: usuario?.id ?? null,
      accion: "login_fallido",
      entidad: "usuario",
      entidadId: usuario?.id,
      detalle: { identificador: datos.data.identificador },
    });
    return { error: "Usuario o contraseña incorrectos." };
  }

  await iniciarSesion(usuario.id);
  await registrarAuditoria({ usuarioId: usuario.id, accion: "login", entidad: "usuario", entidadId: usuario.id });
  redirect(usuario.rol === "cliente" ? "/portal" : "/");
}

export async function salir() {
  const usuario = await obtenerUsuario();
  await cerrarSesion();
  if (usuario) {
    await registrarAuditoria({ usuarioId: usuario.id, accion: "logout", entidad: "usuario", entidadId: usuario.id });
  }
  redirect("/login");
}
