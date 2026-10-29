import Link from "next/link";
import { and, asc, desc, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cierres, operaciones } from "@/db/schema";
import { GraficoLineas } from "@/components/graficos";
import { Indicador, Seccion } from "@/components/indicadores";
import { Boton, Encabezado, Entrada, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { FormularioCalcular } from "./formularios";

export const metadata = { title: "Cierres diarios" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function PaginaCierres({ searchParams }: PageProps<"/cierres">) {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const p = await searchParams;
  const hoy = new Date();
  const desde = esFecha(p.desde) ? p.desde : iso(new Date(hoy.getTime() - 59 * 86_400_000));
  const hasta = esFecha(p.hasta) ? p.hasta : iso(hoy);

  const [filas, [anterior], comisiones] = await Promise.all([
    db.select().from(cierres).where(and(gte(cierres.fecha, desde), lte(cierres.fecha, hasta))).orderBy(asc(cierres.fecha)),
    // Último cierre antes del periodo, para calcular la variación del primer día.
    db.select({ patrimonio: cierres.patrimonio }).from(cierres).where(sql`${cierres.fecha} < ${desde}`).orderBy(desc(cierres.fecha)).limit(1),
    db
      .select({ fecha: operaciones.fecha, comisiones: sql<string>`coalesce(sum(${operaciones.utilidad}), 0)` })
      .from(operaciones)
      .where(and(gte(operaciones.fecha, desde), lte(operaciones.fecha, hasta), sql`${operaciones.estado} not in ('rechazada', 'anulada')`))
      .groupBy(operaciones.fecha),
  ]);
  const comisionesDe = new Map(comisiones.map((c) => [c.fecha, Number(c.comisiones)]));
  const patrimonioAnterior = anterior ? Number(anterior.patrimonio) : null;
  const dias = filas.map((c, i) => {
    const patrimonio = Number(c.patrimonio);
    const previo = i === 0 ? patrimonioAnterior : Number(filas[i - 1].patrimonio);
    const variacion = previo === null ? null : patrimonio - previo;
    return { ...c, patrimonioN: patrimonio, variacion, comisiones: comisionesDe.get(c.fecha) ?? 0 };
  });
  const ultimo = dias.at(-1);
  const conVariacion = dias.filter((d) => d.variacion !== null);
  const gananciaPeriodo = conVariacion.reduce((t, d) => t + d.variacion!, 0);
  const mejor = conVariacion.reduce<(typeof dias)[0] | null>((m, d) => (!m || d.variacion! > m.variacion! ? d : m), null);
  const peor = conVariacion.reduce<(typeof dias)[0] | null>((m, d) => (!m || d.variacion! < m.variacion! ? d : m), null);

  return (
    <>
      <Encabezado
        titulo="Cierres diarios"
        descripcion="Balance guardado de cada día y su variación: la ganancia o pérdida del día (US$)."
        acciones={
          <Link href="/balance" className="text-sm underline">
            Ir al balance de hoy para cerrar el día
          </Link>
        }
      />
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Desde
          <Entrada type="date" name="desde" defaultValue={desde} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <Entrada type="date" name="hasta" defaultValue={hasta} className="mt-1 w-40" />
        </label>
        <Boton type="submit" variante="secundario">
          Ver
        </Boton>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Patrimonio neto"
          valor={ultimo ? importe(ultimo.patrimonioN) : "—"}
          detalle={ultimo ? `Cierre del ${fechaCorta(ultimo.fecha)}` : "Sin cierres en el periodo"}
        />
        <Indicador
          titulo="Ganancia del último día"
          valor={ultimo?.variacion != null ? importe(ultimo.variacion) : "—"}
          tono={ultimo?.variacion != null && ultimo.variacion < 0 ? "cobrar" : "favor"}
          detalle="Patrimonio del día menos el del cierre anterior"
        />
        <Indicador
          titulo="Ganancia del periodo"
          valor={conVariacion.length ? importe(gananciaPeriodo) : "—"}
          tono={gananciaPeriodo < 0 ? "cobrar" : "favor"}
          detalle={`${conVariacion.length} días con variación`}
        />
        <Indicador
          titulo="Mejor / peor día"
          valor={<span className="text-base">{mejor ? `${importe(mejor.variacion)} · ${importe(peor!.variacion)}` : "—"}</span>}
          detalle={mejor ? `${fechaCorta(mejor.fecha)} · ${fechaCorta(peor!.fecha)}` : undefined}
        />
      </div>

      {dias.length > 1 && (
        <div className="mt-6">
          <Seccion titulo="Patrimonio neto al cierre de cada día">
            <GraficoLineas
              series={[{ nombre: "Patrimonio", color: "var(--serie-1)", puntos: dias.map((d) => ({ x: d.fecha, y: d.patrimonioN })) }]}
              formatoX="dia"
              desdeCero={false}
              ancho={1000}
            />
          </Seccion>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Cierres</h2>
        <Tabla>
          <thead>
            <tr>
              <Th>Día</Th>
              <Th className="text-right">Tasa</Th>
              <Th className="text-right">Disponible</Th>
              <Th className="text-right">Por cobrar</Th>
              <Th className="text-right">Provisión</Th>
              <Th className="text-right">Por pagar</Th>
              <Th className="text-right">Patrimonio</Th>
              <Th className="text-right">Ganancia del día</Th>
              <Th className="text-right">Comisiones ops.</Th>
            </tr>
          </thead>
          <tbody>
            {dias.length === 0 && (
              <FilaVacia columnas={9} texto="No hay cierres en este periodo. Guárdalos desde el Balance o calcúlalos abajo." />
            )}
            {[...dias].reverse().map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap">
                  <Link href={`/balance?corte=${d.fecha}&tasa=${d.tasa ?? ""}`} className="font-medium hover:underline">
                    {fechaCorta(d.fecha)}
                  </Link>
                  <span className="block text-xs text-slate-500" title={d.notas ?? undefined}>
                    {d.tipo === "manual" ? "Guardado" : "Calculado"}
                    {d.notas && ` · ${d.notas.length > 24 ? `${d.notas.slice(0, 24)}…` : d.notas}`}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{d.tasa ? importe(d.tasa) : "—"}</Td>
                <Td className="text-right tabular-nums">{importe(Number(d.disponibleUsd) + Number(d.bsEnUsd))}</Td>
                <Td className="text-right tabular-nums">{importe(d.porCobrar)}</Td>
                <Td className="text-right tabular-nums text-slate-500">{Number(d.provisionIncobrables) ? `−${importe(d.provisionIncobrables)}` : "—"}</Td>
                <Td className="text-right tabular-nums">{importe(d.porPagar)}</Td>
                <Td className="text-right font-medium tabular-nums">{importe(d.patrimonioN)}</Td>
                <Td className={`text-right font-medium tabular-nums ${d.variacion !== null && d.variacion < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {d.variacion === null ? "—" : `${d.variacion > 0 ? "+" : ""}${importe(d.variacion)}`}
                </Td>
                <Td className="text-right tabular-nums text-slate-600">{d.comisiones ? importe(d.comisiones) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <p className="mt-2 text-xs text-slate-500">
          La ganancia del día incluye todo lo que mueve el patrimonio: márgenes de cambio, comisiones, gastos y cambios en lo que
          se debe o se nos debe. «Comisiones ops.» es lo registrado en las operaciones de ese día.
        </p>
      </section>

      {usuario.rol === "admin" && (
        <div className="mt-6">
          <Seccion titulo="Calcular cierres de días pasados">
            <FormularioCalcular desde={desde} hasta={hasta} />
          </Seccion>
        </div>
      )}
    </>
  );
}
