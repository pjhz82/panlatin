import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import { Encabezado, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { filtroSubcuentas } from "@/lib/alcance";

export const metadata = { title: "Mis cuentas" };

export default async function PaginaPortal() {
  const usuario = await requerirUsuario(["cliente"]);
  const lista = await db
    .select({ id: subcuentas.id, nombre: subcuentas.nombre })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .where(and(filtroSubcuentas(usuario), eq(subcuentas.activa, true)))
    .orderBy(asc(subcuentas.nombre));

  return (
    <>
      <Encabezado
        titulo="Mis cuentas"
        descripcion="Cada cuenta tiene su propio estado de cuenta y sus propios pedidos."
      />
      {lista.length === 0 ? (
        <Tarjeta className="p-6 text-sm text-slate-500">
          Todavía no tienes cuentas activas. Contacta con tu ejecutivo.
        </Tarjeta>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((s) => (
            <Tarjeta key={s.id} className="p-5">
              <p className="font-medium">{s.nombre}</p>
              <p className="mt-2 text-sm text-slate-500">
                Pronto podrás ver aquí tu estado de cuenta y solicitar pedidos.
              </p>
            </Tarjeta>
          ))}
        </div>
      )}
    </>
  );
}
