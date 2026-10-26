"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { esquemaCatalogos, importarCatalogos, type ResultadoImportacion } from "@/lib/catalogos";

export type EstadoImportacion = { error?: string; resultado?: ResultadoImportacion };

export async function importar(_prev: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const usuario = await requerirUsuario(["admin"]);
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige el archivo de catálogos." };
  if (archivo.size > 2_000_000) return { error: "El archivo es demasiado grande (máximo 2 MB)." };

  let contenido: unknown;
  try {
    contenido = JSON.parse(await archivo.text());
  } catch {
    return { error: "El archivo no es un JSON válido." };
  }
  const datos = esquemaCatalogos.safeParse(contenido);
  if (!datos.success) return { error: "El archivo no tiene el formato de catálogos esperado." };

  const resultado = await db.transaction((tx) => importarCatalogos(tx, datos.data));
  await registrarAuditoria({
    usuarioId: usuario.id,
    accion: "crear",
    entidad: "importacion_catalogos",
    detalle: { archivo: archivo.name, ...resultado },
  });
  revalidatePath("/", "layout");
  return { resultado };
}
