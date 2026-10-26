import { z } from "zod";

/** Estado que devuelven las Server Actions de formularios a useActionState. */
export type EstadoFormulario = {
  ok?: boolean;
  error?: string;
  errores?: Record<string, string>;
};

export const estadoInicial: EstadoFormulario = {};

/** Primer mensaje de error de Zod por campo. */
export function erroresDeZod(error: z.ZodError): EstadoFormulario {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "");
    if (campo && !errores[campo]) errores[campo] = issue.message;
  }
  return { error: "Revisa los campos marcados.", errores };
}

/** FormData a objeto plano; los campos vacíos pasan a undefined. Las contraseñas no se recortan. */
export function datosFormulario(formData: FormData): Record<string, string | undefined> {
  const datos: Record<string, string | undefined> = {};
  for (const [clave, valor] of formData.entries()) {
    if (typeof valor !== "string") continue;
    const limpio = clave === "password" ? valor : valor.trim();
    datos[clave] = limpio === "" ? undefined : limpio;
  }
  return datos;
}

/** Error de PostgreSQL por valor único repetido. */
export function esDuplicado(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Nombre de usuario para entrar: minúsculas, sin espacios. */
export const campoUsuario = z
  .string("Escribe el nombre de usuario.")
  .min(2, "Mínimo 2 caracteres.")
  .max(60)
  // Sin @ para que nunca coincida con el correo de otra persona al entrar.
  .regex(/^[a-zA-Z0-9._-]+$/, "Solo letras, números y . _ - (sin espacios ni @).")
  .transform((u) => u.toLowerCase());

/** Correo opcional. */
export const campoEmailOpcional = z
  .email("Escribe un correo válido o déjalo vacío.")
  .transform((e) => e.toLowerCase())
  .optional();
