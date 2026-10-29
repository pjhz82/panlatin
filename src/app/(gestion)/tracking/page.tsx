import Link from "next/link";
import { gte } from "drizzle-orm";
import { operaciones } from "@/db/schema";
import { BarraAvance } from "@/components/avance";
import { Boton, Encabezado, Entrada, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { ABIERTAS, haceDias, operacionesConAvance, type OperacionConAvance } from "@/lib/flujo";
import { TIPOS_OPERACION } from "@/lib/operaciones";

export const metadata = { title: "Tracking" };

type Etapa = { clave: string; titulo: string; ayuda: string; ops: OperacionConAvance[] };

/** En qué etapa está una operación (la primera que la detiene). */
function etapaDe(o: OperacionConAvance) {
  if (o.estado === "completada") return "completadas";
  if (o.estado === "pendiente_firmas" || o.cambioPendiente) return "aprobacion";
  if (o.porPagar > 0) return "pagos";
  return "balance";
}

const diasDesde = (fecha: string, hoy: string) => Math.max(0, Math.round((Date.parse(hoy) - Date.parse(fecha)) / 864e5));

export default async function PaginaTracking({ searchParams }: PageProps<"/tracking">) {
  await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const hoy = haceDias(0);
  const [abiertas, completadas] = await Promise.all([
    operacionesConAvance(ABIERTAS, 1000),
    operacionesConAvance(["completada"], 200, gte(operaciones.fecha, haceDias(7))),
  ]);
  const todas = [...abiertas, ...completadas].filter(
    (o) => !q || String(o.id) === q.replace("#", "") || [o.cliente, o.descripcion, o.ejecutivo].some((t) => t?.toLowerCase().includes(q)),
  );
  const etapas: Etapa[] = [
    { clave: "aprobacion", titulo: "Esperando aprobación", ayuda: "Dólares o cambios por firmar", ops: [] },
    { clave: "pagos", titulo: "Pagos por enviar o recibir", ayuda: "Módulo 2 · administradora", ops: [] },
    { clave: "balance", titulo: "Por llevar al balance", ayuda: "Módulo 3 · Beisy", ops: [] },
    { clave: "completadas", titulo: "Completadas (7 días)", ayuda: "Todo pagado y en balance", ops: [] },
  ];
  for (const o of todas) etapas.find((e) => e.clave === etapaDe(o))!.ops.push(o);
  for (const e of etapas) e.ops.sort((a, b) => (e.clave === "completadas" ? b.id - a.id : a.fecha.localeCompare(b.fecha)));

  return (
    <>
      <Encabezado titulo="Tracking de operaciones" descripcion="Cada operación en la etapa en que está. Las más antiguas arriba; en rojo, las que llevan más de 2 días abiertas." />
      <form className="mb-6 flex max-w-md gap-2">
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nº de operación, cliente o ejecutivo" />
        <Boton type="submit" variante="secundario">
          Buscar
        </Boton>
      </form>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {etapas.map((e) => (
          <section key={e.clave} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{e.titulo}</h2>
              <span className="text-sm tabular-nums text-slate-500">{e.ops.length}</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">{e.ayuda}</p>
            <div className="space-y-2">
              {e.ops.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">Nada aquí</p>}
              {e.ops.map((o) => {
                const dias = diasDesde(o.fecha, hoy);
                const atrasada = e.clave !== "completadas" && dias > 2;
                return (
                  <Link key={o.id} href={`/operaciones/${o.id}`} className="block">
                    <Tarjeta className={`p-3 transition hover:border-slate-400 ${atrasada ? "border-red-300" : ""}`}>
                      <div className="flex items-start justify-between gap-2 text-sm">
                        <span className="font-medium">
                          #{o.id} · {o.cliente ?? o.descripcion ?? "Sin cliente"}
                        </span>
                        <span className={`whitespace-nowrap text-xs ${atrasada ? "font-semibold text-red-700" : "text-slate-500"}`}>
                          {e.clave === "completadas" ? fechaCorta(o.fecha) : dias === 0 ? "hoy" : `${dias} d`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {TIPOS_OPERACION[o.tipo].nombre}
                        {o.montoUsd && ` · US$ ${importe(o.montoUsd)}`}
                        {o.ejecutivo && ` · ${o.ejecutivo}`}
                      </p>
                      <div className="mt-2 space-y-1">
                        {o.partidas.some((p) => p.avance.ladoBanco) && <BarraAvance pct={o.pctPagado} etiqueta={`Pagado ${Math.round(o.pctPagado * 100)} %`} />}
                        {o.partidas.some((p) => p.avance.ladoCliente) && <BarraAvance pct={o.pctBalance} etiqueta={`Balance ${Math.round(o.pctBalance * 100)} %`} />}
                      </div>
                      {o.cambioPendiente && <p className="mt-1 text-xs text-amber-700">Cambio por aprobar</p>}
                    </Tarjeta>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
