import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sesiones, usuarios, type Rol } from "@/db/schema";

export const COOKIE_SESION = "sesion";
const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // una jornada

export type UsuarioActual = {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  ejecutivoId: number | null;
  clienteId: number | null;
  debeCambiarPassword: boolean;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export const verificarPassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);

/** Crea la sesión y deja la cookie. Solo desde una Server Action. */
export async function iniciarSesion(usuarioId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + DURACION_SESION_MS);
  await db.insert(sesiones).values({ id: hashToken(token), usuarioId, expiraEn });
  await db
    .update(usuarios)
    .set({ ultimoAcceso: new Date() })
    .where(eq(usuarios.id, usuarioId));
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEn,
  });
}

/** Borra la sesión actual. Solo desde una Server Action. */
export async function cerrarSesion() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESION)?.value;
  if (token) await db.delete(sesiones).where(eq(sesiones.id, hashToken(token)));
  jar.delete(COOKIE_SESION);
}

/** Usuario de la petición actual, o null. Se memoriza durante la petición. */
export const obtenerUsuario = cache(async (): Promise<UsuarioActual | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;
  const [fila] = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      usuario: usuarios.usuario,
      rol: usuarios.rol,
      ejecutivoId: usuarios.ejecutivoId,
      clienteId: usuarios.clienteId,
      debeCambiarPassword: usuarios.debeCambiarPassword,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(
      and(
        eq(sesiones.id, hashToken(token)),
        gt(sesiones.expiraEn, new Date()),
        eq(usuarios.activo, true),
      ),
    )
    .limit(1);
  if (!fila) return null;
  // Los ejecutivos tienen poder para hacer todo: valen como administradores.
  // Su ejecutivoId se conserva para que su firma cuente en las aprobaciones.
  return fila.rol === "ejecutivo" ? { ...fila, rol: "admin" } : fila;
});

/**
 * Exige sesión iniciada y, si se indican, uno de los roles.
 * Usar al principio de cada página y de cada Server Action.
 */
export async function requerirUsuario(roles?: readonly Rol[]): Promise<UsuarioActual> {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");
  if (usuario.debeCambiarPassword) redirect("/cambiar-clave");
  if (roles && !roles.includes(usuario.rol)) {
    redirect(usuario.rol === "cliente" ? "/portal" : "/");
  }
  return usuario;
}
