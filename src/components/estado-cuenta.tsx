import Link from "next/link";
import type { Moneda } from "@/db/schema";
import { conMoneda, fechaCorta, importe } from "@/lib/dinero";
import { estadoDeCuenta, evolucionDe, POR_PAGINA, referenciaExcel, type Destino } from "@/lib/datos";
import { GraficoBarras, GraficoLineas } from "./graficos";
import { Indicador, Seccion } from "./indicadores";
import { Boton, Entrada, FilaVacia, Insignia, Tabla, Td, Th } from "./ui";

type Parametros = Record<string, string | string[] | undefined>;
const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const fechaValida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/**
 * Panel y estado de cuenta de una subcuenta de cliente o de una cuenta de tesorería.
 * En subcuentas, saldo positivo = a favor del cliente (por pagar); negativo = por cobrar.
 */
export async function EstadoDeCuenta({
  destino,
  moneda,
  parametros,
  ruta,
  mostrarRevision = true,
}: {
  destino: Destino;
  moneda: Moneda;
  parametros: Parametros;
  ruta: string;
  /** El cuadre con el Excel es interno: no se muestra a los clientes. */
  mostrarRevision?: boolean;
}) {
  const esCliente = "subcuentaId" in destino;
  const filtro = {
    desde: fechaValida(texto(parametros.desde)),
    hasta: fechaValida(texto(parametros.hasta)),
    q: texto(parametros.q)?.slice(0, 80),
    pagina: Math.max(1, Number(texto(parametros.pagina)) || 1),
  };
  const filtrado = Boolean(filtro.desde || filtro.hasta || filtro.q);

  const [estado, todo, evolucion, referencia] = await Promise.all([
    estadoDeCuenta(destino, filtro),
    estadoDeCuenta(destino, { pagina: 1 }),
    evolucionDe(destino, 12),
    referenciaExcel(destino),
  ]);
  const saldoActual = todo.filas[0]?.saldo ?? 0;
  const ultimo = todo.filas[0]?.fecha;
  const paginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
  const cuadra = referencia?.saldo === null || referencia === null ? null : Math.abs(saldoActual - referencia.saldo) < 0.05;

  const enlace = (pagina: number) => {
    const p = new URLSearchParams();
    if (filtro.desde) p.set("desde", filtro.desde);
    if (filtro.hasta) p.set("hasta", filtro.hasta);
    if (filtro.q) p.set("q", filtro.q);
    if (pagina > 1) p.set("pagina", String(pagina));
    const s = p.toString();
    return s ? `${ruta}?${s}` : ruta;
  };

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 sm:grid-cols-2 ${mostrarRevision ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Indicador
          titulo={esCliente ? (saldoActual >= 0 ? "Saldo a favor del cliente" : "Saldo por cobrar") : "Saldo actual"}
          valor={conMoneda(esCliente ? Math.abs(saldoActual) : saldoActual, moneda)}
          tono={esCliente ? (saldoActual >= 0 ? "favor" : "cobrar") : "normal"}
          detalle={ultimo ? `Último movimiento: ${fechaCorta(ultimo)}` : "Sin movimientos"}
        />
        <Indicador titulo={esCliente ? "Abonos (total)" : "Entradas (total)"} valor={importe(todo.abonos)} detalle={`${todo.total} movimientos`} />
        <Indicador titulo={esCliente ? "Cargos (total)" : "Salidas (total)"} valor={importe(todo.cargos)} />
        {mostrarRevision && (
        <Indicador
          titulo="Cuadre con el Excel"
          valor={
            cuadra === null ? (
              <span className="text-base text-slate-500">Sin referencia</span>
            ) : cuadra ? (
              <span className="text-base text-emerald-700">✓ Cuadra</span>
            ) : (
              <span className="text-base text-red-700">✗ Diferencia</span>
            )
          }
          detalle={
            referencia
              ? `Hoja «${referencia.hoja}»${referencia.saldo !== null ? ` · saldo Excel ${importe(referencia.saldo)}` : ""}`
              : "No se importó desde Excel"
          }
        />
        )}
      </div>

      {todo.total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Seccion titulo="Saldo al cierre de cada mes">
            <GraficoLineas
              series={[{ nombre: "Saldo", color: "var(--serie-1)", puntos: evolucion.map((e) => ({ x: e.mes, y: e.saldo })) }]}
            />
          </Seccion>
          <Seccion titulo={esCliente ? "Abonos y cargos por mes" : "Entradas y salidas por mes"}>
            <GraficoBarras
              categorias={evolucion.map((e) => e.mes)}
              series={[
                { nombre: esCliente ? "Abonos" : "Entradas", color: "var(--serie-1)", valores: evolucion.map((e) => e.entradas) },
                { nombre: esCliente ? "Cargos" : "Salidas", color: "var(--serie-2)", valores: evolucion.map((e) => e.salidas) },
              ]}
            />
          </Seccion>
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Estado de cuenta</h2>
          <form className="flex flex-wrap items-end gap-2" action={ruta}>
            <label className="text-xs text-slate-500">
              Desde
              <Entrada type="date" name="desde" defaultValue={filtro.desde} className="mt-1 w-40" />
            </label>
            <label className="text-xs text-slate-500">
              Hasta
              <Entrada type="date" name="hasta" defaultValue={filtro.hasta} className="mt-1 w-40" />
            </label>
            <label className="text-xs text-slate-500">
              Buscar
              <Entrada name="q" defaultValue={filtro.q} placeholder="Concepto, detalle…" className="mt-1 w-52" />
            </label>
            <Boton type="submit" variante="secundario">
              Filtrar
            </Boton>
            {filtrado && (
              <Link href={ruta} className="pb-2 text-sm text-slate-500 underline">
                Quitar filtros
              </Link>
            )}
          </form>
        </div>
        {filtrado && (
          <p className="mb-2 text-sm text-slate-600">
            {estado.total} movimientos · {esCliente ? "abonos" : "entradas"} {importe(estado.abonos)} ·{" "}
            {esCliente ? "cargos" : "salidas"} {importe(estado.cargos)}
          </p>
        )}
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>{esCliente ? "Pagado a / por" : "Detalle"}</Th>
              <Th>{esCliente ? "Forma de pago" : "Referencia"}</Th>
              <Th className="text-right">{esCliente ? "Cargo" : "Salida"}</Th>
              <Th className="text-right">{esCliente ? "Abono" : "Entrada"}</Th>
              <Th className="text-right">Saldo</Th>
            </tr>
          </thead>
          <tbody>
            {estado.filas.length === 0 && <FilaVacia columnas={7} texto="No hay movimientos." />}
            {estado.filas.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap tabular-nums">{fechaCorta(m.fecha)}</Td>
                <Td>
                  {m.concepto ?? "—"}
                  {m.nota && (
                    <span className="ml-2">
                      <Insignia color="ambar">{m.nota}</Insignia>
                    </span>
                  )}
                </Td>
                <Td className="max-w-xs truncate text-slate-600">{m.detalle ?? "—"}</Td>
                <Td className="text-slate-600">{(esCliente ? m.formaPago : m.referencia) ?? "—"}</Td>
                <Td className="text-right tabular-nums text-slate-900">{m.importe < 0 ? importe(-m.importe) : ""}</Td>
                <Td className="text-right tabular-nums text-slate-900">{m.importe > 0 ? importe(m.importe) : ""}</Td>
                <Td className={`text-right font-medium tabular-nums ${m.saldo < 0 && esCliente ? "text-red-700" : ""}`}>
                  {importe(m.saldo)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        {paginas > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>
              Página {filtro.pagina} de {paginas} · {estado.total} movimientos
            </span>
            <span className="flex gap-2">
              {filtro.pagina > 1 && (
                <Link className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50" href={enlace(filtro.pagina - 1)}>
                  ← Más recientes
                </Link>
              )}
              {filtro.pagina < paginas && (
                <Link className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50" href={enlace(filtro.pagina + 1)}>
                  Más antiguos →
                </Link>
              )}
            </span>
          </div>
        )}
        {esCliente && (
          <p className="mt-2 text-xs text-slate-500">
            Saldo positivo: a favor del cliente (por pagar). Saldo negativo: por cobrar al cliente.
          </p>
        )}
      </section>
    </div>
  );
}
