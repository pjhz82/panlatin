import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos, tipoOperacion, type TipoOperacion } from "@/db/schema";
import { GraficoBarras, GraficoLineas } from "@/components/graficos";
import { Indicador, Seccion } from "@/components/indicadores";
import { Boton, Encabezado, Entrada, FilaVacia, Insignia, Selector, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { panelOperaciones } from "@/lib/datos-operaciones";
import { fechaCorta, importe } from "@/lib/dinero";
import { ESTADOS_OPERACION, TIPOS_OPERACION } from "@/lib/operaciones";

export const metadata = { title: "Panel de operaciones" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function rangos(hoy: Date) {
  const d = (dias: number) => iso(new Date(hoy.getTime() - dias * 86_400_000));
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const inicioMesAnterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
  return [
    { nombre: "Hoy", desde: d(0), hasta: d(0) },
    { nombre: "Ayer", desde: d(1), hasta: d(1) },
    { nombre: "7 días", desde: d(6), hasta: d(0) },
    { nombre: "30 días", desde: d(29), hasta: d(0) },
    { nombre: "Este mes", desde: iso(inicioMes), hasta: d(0) },
    { nombre: "Mes anterior", desde: iso(inicioMesAnterior), hasta: iso(new Date(inicioMes.getTime() - 86_400_000)) },
  ];
}

export default async function PaginaPanelOperaciones({ searchParams }: PageProps<"/operaciones/panel">) {
  await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const p = await searchParams;
  const hoy = new Date();
  const desde = esFecha(p.desde) ? p.desde : iso(new Date(hoy.getTime() - 29 * 86_400_000));
  const hasta = esFecha(p.hasta) ? p.hasta : iso(hoy);
  const tipo = (tipoOperacion.enumValues as readonly string[]).includes(String(p.tipo)) ? (p.tipo as TipoOperacion) : undefined;
  const ejecutivoId = Number(p.ejecutivo) || undefined;

  const [datos, listaEjecutivos] = await Promise.all([
    panelOperaciones({ desde, hasta, tipo, ejecutivoId }),
    db.select({ id: ejecutivos.id, codigo: ejecutivos.codigo }).from(ejecutivos).orderBy(asc(ejecutivos.codigo)),
  ]);
  const t = datos.total;
  const spread = t.tasaCompra && t.tasaVenta ? t.tasaVenta - t.tasaCompra : null;
  // Margen cambiario estimado: lo comprado y vendido en el periodo por la diferencia de tasas, en US$.
  const margen = spread !== null && t.tasaVenta ? (Math.min(t.compras, t.ventas) * spread) / t.tasaVenta : null;
  const enlace = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ desde, hasta, ...(tipo ? { tipo } : {}), ...(ejecutivoId ? { ejecutivo: String(ejecutivoId) } : {}), ...extra });
    return `/operaciones/panel?${q}`;
  };
  const unDia = desde === hasta;

  return (
    <>
      <Encabezado
        titulo="Panel de operaciones"
        descripcion={`${unDia ? fechaCorta(desde) : `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`} · importes en US$ salvo indicación`}
        acciones={
          <Link href="/operaciones" className="text-sm underline">
            Ver bandeja de operaciones
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {rangos(hoy).map((r) => (
          <Link
            key={r.nombre}
            href={enlace({ desde: r.desde, hasta: r.hasta })}
            className={`rounded-full px-3 py-1.5 ${r.desde === desde && r.hasta === hasta ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {r.nombre}
          </Link>
        ))}
      </div>
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Desde
          <Entrada type="date" name="desde" defaultValue={desde} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <Entrada type="date" name="hasta" defaultValue={hasta} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Tipo
          <Selector name="tipo" defaultValue={tipo ?? ""} className="mt-1 w-48">
            <option value="">Todos</option>
            {Object.entries(TIPOS_OPERACION).map(([v, x]) => (
              <option key={v} value={v}>
                {x.nombre}
              </option>
            ))}
          </Selector>
        </label>
        <label className="text-xs text-slate-500">
          Ejecutivo
          <Selector name="ejecutivo" defaultValue={ejecutivoId ?? ""} className="mt-1 w-36">
            <option value="">Todos</option>
            {listaEjecutivos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo}
              </option>
            ))}
          </Selector>
        </label>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador titulo="Operaciones" valor={t.operaciones.toLocaleString("es")} detalle={`${t.clientes} clientes · ${t.pendientes} pendientes de firma`} />
        <Indicador titulo="Compras de US$" valor={importe(t.compras)} detalle={t.tasaCompra ? `Tasa media ${importe(t.tasaCompra)}` : "Sin tasa"} />
        <Indicador titulo="Ventas de US$" valor={importe(t.ventas)} detalle={t.tasaVenta ? `Tasa media ${importe(t.tasaVenta)}` : "Sin tasa"} />
        <Indicador
          titulo="Margen cambiario estimado"
          valor={margen === null ? "—" : importe(margen)}
          tono={margen !== null && margen < 0 ? "cobrar" : "normal"}
          detalle={spread !== null ? `Diferencia venta − compra: ${importe(spread)} Bs./US$` : "Necesita compras y ventas con tasa"}
        />
        <Indicador
          titulo="Comisiones netas"
          valor={importe(t.utilidad)}
          tono={t.utilidad < 0 ? "cobrar" : "normal"}
          detalle="Comisiones cobradas menos costes y comisiones pagadas"
        />
      </div>

      {!unDia && datos.porDia.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Seccion titulo="Compras y ventas de US$ por día">
            <GraficoBarras
              categorias={datos.porDia.map((d) => d.dia)}
              series={[
                { nombre: "Compras", color: "var(--serie-1)", valores: datos.porDia.map((d) => d.compras) },
                { nombre: "Ventas", color: "var(--serie-2)", valores: datos.porDia.map((d) => d.ventas) },
              ]}
              formatoX="dia"
            />
          </Seccion>
          <Seccion titulo="Tasa media por día (Bs. por US$)">
            <GraficoLineas
              series={[
                { nombre: "Compra", color: "var(--serie-1)", puntos: datos.porDia.filter((d) => d.tasaCompra).map((d) => ({ x: d.dia, y: d.tasaCompra! })) },
                { nombre: "Venta", color: "var(--serie-2)", puntos: datos.porDia.filter((d) => d.tasaCompra).map((d) => ({ x: d.dia, y: d.tasaVenta ?? d.tasaCompra! })) },
              ]}
              formatoX="dia"
              desdeCero={false}
            />
            <p className="mt-1 text-xs text-slate-500">Días sin ventas: la línea de venta repite la de compra.</p>
          </Seccion>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Seccion titulo="Resumen por día">
          <div className="max-h-96 overflow-y-auto">
            <Tabla>
              <thead>
                <tr>
                  <Th>Día</Th>
                  <Th className="text-right">Ops.</Th>
                  <Th className="text-right">Compras</Th>
                  <Th className="text-right">Ventas</Th>
                  <Th className="text-right">Tasa compra</Th>
                  <Th className="text-right">Tasa venta</Th>
                  <Th className="text-right">Comisiones netas</Th>
                </tr>
              </thead>
              <tbody>
                {datos.porDia.length === 0 && <FilaVacia columnas={7} texto="Sin operaciones en el periodo." />}
                {[...datos.porDia].reverse().map((d) => (
                  <tr key={d.dia} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">
                      <Link href={enlace({ desde: d.dia, hasta: d.dia })} className="hover:underline">
                        {fechaCorta(d.dia)}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{d.operaciones}</Td>
                    <Td className="text-right tabular-nums">{importe(d.compras)}</Td>
                    <Td className="text-right tabular-nums">{importe(d.ventas)}</Td>
                    <Td className="text-right tabular-nums text-slate-600">{d.tasaCompra ? importe(d.tasaCompra) : "—"}</Td>
                    <Td className="text-right tabular-nums text-slate-600">{d.tasaVenta ? importe(d.tasaVenta) : "—"}</Td>
                    <Td className={`text-right tabular-nums ${d.utilidad < 0 ? "text-red-700" : ""}`}>{importe(d.utilidad)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        </Seccion>
        <div className="grid gap-4 lg:grid-cols-2">
          <Seccion titulo="Por ejecutivo">
            <Tabla>
              <thead>
                <tr>
                  <Th>Ejecutivo</Th>
                  <Th className="text-right">Ops.</Th>
                  <Th className="text-right">Compras + ventas</Th>
                  <Th className="text-right">Comisiones netas</Th>
                </tr>
              </thead>
              <tbody>
                {datos.porEjecutivo.map((e) => (
                  <tr key={e.ejecutivo}>
                    <Td className="font-medium">{e.ejecutivo}</Td>
                    <Td className="text-right tabular-nums">{e.operaciones}</Td>
                    <Td className="text-right tabular-nums">{importe(e.compras + e.ventas)}</Td>
                    <Td className="text-right tabular-nums">{importe(e.utilidad)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Seccion>
          <Seccion titulo="Por tipo">
            <Tabla>
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th className="text-right">Ops.</Th>
                  <Th className="text-right">US$</Th>
                </tr>
              </thead>
              <tbody>
                {datos.porTipo.map((x) => (
                  <tr key={x.tipo}>
                    <Td>
                      <Link href={enlace({ tipo: x.tipo })} className="hover:underline">
                        {TIPOS_OPERACION[x.tipo].nombre}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{x.operaciones}</Td>
                    <Td className="text-right tabular-nums">{importe(x.usd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Seccion>
        </div>
      </div>

      <div className="mt-6">
        <Seccion titulo="Clientes con más volumen">
          <Tabla>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="text-right">Ops.</Th>
                <Th className="text-right">US$</Th>
                <Th className="text-right">Comisiones netas</Th>
              </tr>
            </thead>
            <tbody>
              {datos.topClientes.map((c) => (
                <tr key={`${c.id}-${c.nombre}`}>
                  <Td>
                    {c.id ? (
                      <Link href={`/subcuentas/${c.id}?vista=operaciones`} className="hover:underline">
                        {c.nombre}
                      </Link>
                    ) : (
                      c.nombre
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{c.operaciones}</Td>
                  <Td className="text-right tabular-nums">{importe(c.usd)}</Td>
                  <Td className="text-right tabular-nums">{importe(c.utilidad)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Seccion>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">
          Operaciones del periodo{" "}
          <span className="text-sm font-normal text-slate-500">
            ({t.operaciones > datos.lista.length ? `las ${datos.lista.length} más recientes de ${t.operaciones}` : t.operaciones})
          </span>
        </h2>
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Cliente</Th>
              <Th>Proveedor / cliente final</Th>
              <Th>Ejec.</Th>
              <Th className="text-right">US$</Th>
              <Th className="text-right">Tasa</Th>
              <Th className="text-right">Bs.</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {datos.lista.length === 0 && <FilaVacia columnas={9} texto="Sin operaciones en el periodo." />}
            {datos.lista.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap">
                  {o.origen === "web" ? (
                    <Link href={`/operaciones/${o.id}`} className="hover:underline">
                      {fechaCorta(o.fecha)}
                    </Link>
                  ) : (
                    fechaCorta(o.fecha)
                  )}
                </Td>
                <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
                <Td>
                  {o.subcuentaId ? (
                    <Link href={`/subcuentas/${o.subcuentaId}`} className="hover:underline">
                      {o.cliente}
                    </Link>
                  ) : (
                    (o.cliente ?? "—")
                  )}
                </Td>
                <Td className="max-w-48 truncate text-slate-600">{o.contraparte ?? "—"}</Td>
                <Td>{o.ejecutivo ?? "—"}</Td>
                <Td className="text-right tabular-nums">{o.montoUsd ? importe(o.montoUsd) : "—"}</Td>
                <Td className="text-right tabular-nums">{o.tasa ? importe(o.tasa) : "—"}</Td>
                <Td className="text-right tabular-nums">{o.montoBs ? importe(o.montoBs) : "—"}</Td>
                <Td>
                  {o.origen === "excel" ? (
                    <Insignia>Histórica</Insignia>
                  ) : (
                    <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </section>
    </>
  );
}
