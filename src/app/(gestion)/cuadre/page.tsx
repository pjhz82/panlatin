import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { ListaComprobantes } from "@/components/comprobantes";
import { FormularioAlBalance, FormularioRevertir } from "@/components/formularios-flujo";
import { comprobantesDe } from "@/lib/comprobantes";
import { Encabezado, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { pagos } from "@/db/schema";
import { SIMBOLO } from "@/lib/operaciones";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { haceDias, pagosReportados, pendientesDeBalance } from "@/lib/flujo";

export const metadata = { title: "Balance de clientes" };

export default async function PaginaCuadre() {
  await requerirUsuario(["admin", "operadora"]);
  const hace7 = haceDias(7);
  const [{ porPago, sinBanco }, llevados] = await Promise.all([pendientesDeBalance(), pagosReportados(hace7, isNotNull(pagos.balanceEn))]);

  const listaComprobantes = await comprobantesDe(porPago.map((p) => p.id));

  return (
    <>
      <Encabezado
        titulo="Balance de clientes"
        descripcion="Módulo 3 · Beisy revisa lo pagado y cobrado contra la instrucción y lo lleva a la hoja del cliente."
      />

      <h2 className="mb-3 text-lg font-semibold">
        Pagos por llevar al balance <span className="text-sm font-normal text-slate-500">({porPago.length})</span>
      </h2>
      <Tabla>
        <thead>
          <tr>
            <Th>Pago</Th>
            <Th>Cliente</Th>
            <Th>Partida</Th>
            <Th className="text-right">Banco</Th>
            <Th className="text-right">Cliente US$</Th>
            <Th>Revisar</Th>
          </tr>
        </thead>
        <tbody>
          {porPago.length === 0 && <FilaVacia columnas={6} texto="Todo lo pagado está en el balance." />}
          {porPago.map((p) => (
            <tr key={p.id} className="align-top">
              <Td className="whitespace-nowrap">
                {fechaCorta(p.fecha)}
                <Link href={`/operaciones/${p.operacionId}`} className="block text-xs text-slate-500 hover:underline">
                  Op. {p.operacionId}
                </Link>
              </Td>
              <Td>
                <Link href={`/subcuentas/${p.subcuentaId}`} className="hover:underline">
                  {p.cliente}
                </Link>
              </Td>
              <Td>
                {p.partida}
                <span className="block text-xs text-slate-500">
                  {p.cuenta}
                  {p.referencia && ` · ref. ${p.referencia}`} · reportó {p.reporto}
                </span>
                <ListaComprobantes lista={listaComprobantes.filter((c) => c.pagoId === p.id)} base="/comprobantes" />
              </Td>
              <Td className={`whitespace-nowrap text-right tabular-nums ${Number(p.importe) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {SIMBOLO[p.moneda]} {importe(p.importe)}
              </Td>
              <Td className={`whitespace-nowrap text-right font-medium tabular-nums ${Number(p.efectoCliente) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {importe(p.efectoCliente)}
              </Td>
              <Td>
                <FormularioAlBalance tipo="pago" id={p.id} fecha={p.fecha} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <h2 className="mb-3 mt-8 text-lg font-semibold">
        Partidas sin banco (comisiones, ajustes) <span className="text-sm font-normal text-slate-500">({sinBanco.length})</span>
      </h2>
      <Tabla>
        <thead>
          <tr>
            <Th>Op.</Th>
            <Th>Cliente</Th>
            <Th>Partida</Th>
            <Th className="text-right">Cliente US$</Th>
            <Th>Revisar</Th>
          </tr>
        </thead>
        <tbody>
          {sinBanco.length === 0 && <FilaVacia columnas={5} texto="No hay partidas sin banco pendientes." />}
          {sinBanco.map(({ op, partida: p }) => (
            <tr key={p.id} className="align-top">
              <Td>
                <Link href={`/operaciones/${op.id}`} className="hover:underline">
                  {op.id}
                </Link>
              </Td>
              <Td>{op.cliente}</Td>
              <Td>{p.descripcion}</Td>
              <Td className={`text-right font-medium tabular-nums ${p.efectoCliente < 0 ? "text-red-700" : "text-emerald-700"}`}>{importe(p.efectoCliente)}</Td>
              <Td>
                <FormularioAlBalance tipo="partida" id={p.id} fecha={op.fecha} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Llevados al balance en los últimos 7 días</h2>
      <Tabla>
        <thead>
          <tr>
            <Th>Fecha pago</Th>
            <Th>Cliente</Th>
            <Th>Partida</Th>
            <Th className="text-right">Cliente US$</Th>
            <Th>Revisó</Th>
            <Th>Corregir</Th>
          </tr>
        </thead>
        <tbody>
          {llevados.length === 0 && <FilaVacia columnas={6} texto="Nada en los últimos 7 días." />}
          {llevados.map((p) => (
            <tr key={p.id} className="align-top">
              <Td className="whitespace-nowrap">{fechaCorta(p.fecha)}</Td>
              <Td>{p.cliente}</Td>
              <Td>
                {p.partida}
                <Link href={`/operaciones/${p.operacionId}`} className="block text-xs text-slate-500 hover:underline">
                  Op. {p.operacionId}
                </Link>
              </Td>
              <Td className="text-right tabular-nums">{importe(p.efectoCliente)}</Td>
              <Td className="text-slate-600">
                {p.reviso}
                {p.balanceEn && <span className="block text-xs">{fechaCorta(p.balanceEn)}</span>}
              </Td>
              <Td>
                <FormularioRevertir tipo="balancePago" id={p.id} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
