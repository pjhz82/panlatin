import "server-only";
import { db } from "@/db";
import { auditoria } from "@/db/schema";

export async function registrarAuditoria(entrada: {
  usuarioId: number | null;
  accion: "crear" | "editar" | "activar" | "desactivar" | "login" | "login_fallido" | "logout";
  entidad: string;
  entidadId?: number | null;
  detalle?: unknown;
}) {
  await db.insert(auditoria).values({
    usuarioId: entrada.usuarioId,
    accion: entrada.accion,
    entidad: entrada.entidad,
    entidadId: entrada.entidadId ?? null,
    detalle: entrada.detalle ?? null,
  });
}
