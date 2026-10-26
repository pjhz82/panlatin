import Link from "next/link";
import { eq } from "drizzle-orm";
import { subcuentas } from "@/db/schema";
import { Indicador } from "@/components/indicadores";
import { Encabezado, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { saldosSubcuentas } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";

export const metadata = { title: "Mis cuentas" };

export default async function PaginaPortal() {
  const usuario = await requerirUsuario(["cliente"]);
  const lista = await saldosSubcuentas(usuario, eq(subcuentas.activa, true));
  const total = lista.reduce((t, s) => t + s.saldo, 0);

  return (
    <>
      <Encabezado titulo="Mis cuentas" descripcion="Cada cuenta tiene su propio estado de cuenta." />
      {lista.length === 0 ? (
        <Tarjeta className="p-6 text-sm text-slate-500">Todavía no tienes cuentas activas. Contacta con tu ejecutivo.</Tarjeta>
      ) : (
        <>
          {lista.length > 1 && (
            <div className="mb-6 max-w-sm">
              <Indicador
                titulo={total >= 0 ? "Saldo total a tu favor" : "Saldo total pendiente de pago"}
                valor={`US$ ${importe(Math.abs(total))}`}
                tono={total >= 0 ? "favor" : "cobrar"}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((s) => (
              <Link key={s.id} href={`/portal/${s.id}`}>
                <Tarjeta className="p-5 transition hover:border-slate-400">
                  <p className="font-medium">{s.nombre}</p>
                  <p className={`mt-2 text-2xl font-semibold tabular-nums ${s.saldo < 0 ? "text-red-700" : "text-sky-700"}`}>
                    US$ {importe(Math.abs(s.saldo))}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.saldo < 0 ? "Pendiente de pago" : "A tu favor"}
                    {s.ultimo && ` · último movimiento ${fechaCorta(s.ultimo)}`}
                  </p>
                </Tarjeta>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
