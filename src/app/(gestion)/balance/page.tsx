import Link from "next/link";
import { asc } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { Boton, Encabezado, Entrada, Selector, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { saldosCuentas, saldosSubcuentas, type SaldoCuenta } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";
import { BotonImprimir } from "./imprimir";

export const metadata = { title: "Balance" };

const COMPOSICION = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

function Fila({
  concepto,
  valor,
  detalle,
  nivel = 1,
  fuerte = false,
  href,
}: {
  concepto: ReactNode;
  valor: number | null;
  detalle?: ReactNode;
  nivel?: 0 | 1 | 2;
  fuerte?: boolean;
  href?: string;
}) {
  const sangria = ["", "pl-4", "pl-9"][nivel];
  return (
    <tr className={fuerte ? "border-t border-slate-300 font-semibold" : "border-t border-slate-100"}>
      <td className={`py-1.5 pr-3 ${sangria} ${nivel === 2 ? "text-slate-600" : ""}`}>
        {href ? (
          <Link href={href} className="hover:underline">
            {concepto}
          </Link>
        ) : (
          concepto
        )}
        {detalle && <span className="ml-2 text-xs font-normal text-slate-500">{detalle}</span>}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${nivel === 2 ? "text-slate-600" : ""}`}>
        {valor === null ? "—" : importe(valor)}
      </td>
    </tr>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {titulo}
        </td>
      </tr>
      {children}
    </>
  );
}

export default async function PaginaBalance({ searchParams }: PageProps<"/balance">) {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const p = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const corte = typeof p.corte === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.corte) ? p.corte : hoy;
  const tasaTexto = typeof p.tasa === "string" ? p.tasa.replace(",", ".") : "";
  const tasa = Number(tasaTexto) > 0 ? Number(tasaTexto) : null;
  const empresaId = Number(p.empresa) || null;

  const [todasCuentas, subs, listaEmpresas] = await Promise.all([
    saldosCuentas(corte),
    saldosSubcuentas(usuario, undefined, corte),
    db.select({ id: empresas.id, nombre: empresas.nombre }).from(empresas).orderBy(asc(empresas.nombre)),
  ]);
  // Con una empresa elegida: solo sus cuentas. Wallets, Binance y caja no tienen empresa y se excluyen.
  const ctas = empresaId ? todasCuentas.filter((c) => c.empresaId === empresaId) : todasCuentas;
  const conSaldo = (lista: SaldoCuenta[]) => lista.filter((c) => Math.abs(c.saldo) > 0.005);
  const total = (lista: SaldoCuenta[]) => lista.reduce((t, c) => t + c.saldo, 0);

  const bancosUsd = ctas.filter((c) => c.tipo === "banco" && c.moneda === "USD");
  const bancosBs = ctas.filter((c) => c.tipo === "banco" && c.moneda === "BS");
  const cajas = ctas.filter((c) => c.tipo === "caja");
  const wallets = ctas.filter((c) => c.tipo === "wallet");
  const exchanges = ctas.filter((c) => c.tipo === "exchange");

  const totalBs = total(bancosBs);
  const bsEnUsd = tasa ? totalBs / tasa : 0;
  const disponible = total(bancosUsd) + total(cajas) + total(wallets) + total(exchanges) + bsEnUsd;
  // Las cuentas de clientes son del holding, no de una empresa concreta.
  const deudores = empresaId ? [] : subs.filter((s) => s.saldo < -0.005).sort((a, b) => a.saldo - b.saldo);
  const acreedores = empresaId ? [] : subs.filter((s) => s.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
  const porCobrar = -deudores.reduce((t, s) => t + s.saldo, 0);
  const porPagar = acreedores.reduce((t, s) => t + s.saldo, 0);
  const activo = disponible + porCobrar;
  const pasivo = porPagar;
  const patrimonio = activo - pasivo;

  const partes = [
    { nombre: "Bancos US$", valor: total(bancosUsd) },
    { nombre: "Bancos Bs. (en US$)", valor: bsEnUsd },
    { nombre: "Caja", valor: total(cajas) },
    { nombre: "Wallets y Binance", valor: total(wallets) + total(exchanges) },
    { nombre: "Por cobrar a clientes", valor: porCobrar },
  ].map((x, i) => ({ ...x, color: COMPOSICION[i] }));
  const positivas = partes.filter((x) => x.valor > 0);
  const sumaPositivas = positivas.reduce((t, x) => t + x.valor, 0);
  const empresa = listaEmpresas.find((e) => e.id === empresaId)?.nombre;

  const detalle = (lista: SaldoCuenta[], sufijo = "") =>
    conSaldo(lista).map((c) => (
      <Fila key={c.id} nivel={2} concepto={c.nombre + sufijo} valor={c.saldo} href={`/cuentas/${c.id}`} />
    ));

  return (
    <>
      <Encabezado
        titulo="Hoja de balance"
        descripcion={`${empresa ?? "Holding consolidado"} · al ${fechaCorta(corte)} · importes en US$ (USDT y USDC 1:1)`}
        acciones={<BotonImprimir />}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs text-slate-500">
          Fecha de corte
          <Entrada type="date" name="corte" defaultValue={corte} max={hoy} className="mt-1 w-44" />
        </label>
        <label className="text-xs text-slate-500">
          Tasa Bs. por US$
          <Entrada name="tasa" inputMode="decimal" defaultValue={tasaTexto} placeholder="p. ej. 1013,03" className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Empresa
          <Selector name="empresa" defaultValue={empresaId ?? ""} className="mt-1 w-52">
            <option value="">Holding consolidado</option>
            {listaEmpresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Selector>
        </label>
        <Boton type="submit" variante="secundario">
          Calcular
        </Boton>
      </form>

      {!tasa && totalBs !== 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          Escribe la tasa del día para sumar los Bs. {importe(totalBs)} de los bancos en bolívares al balance. Sin tasa
          no se incluyen.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Tarjeta className="p-6">
          <table className="w-full text-sm">
            <tbody>
              <Bloque titulo="Activo">
                <Fila nivel={0} fuerte concepto="Disponible" valor={disponible} />
                <Fila concepto="Bancos en US$" valor={total(bancosUsd)} />
                {detalle(bancosUsd)}
                <Fila
                  concepto="Bancos en Bs."
                  valor={tasa ? bsEnUsd : null}
                  detalle={`Bs. ${importe(totalBs)}${tasa ? ` a ${importe(tasa)} Bs./US$` : " · sin tasa"}`}
                />
                {conSaldo(bancosBs).map((c) => (
                  <Fila
                    key={c.id}
                    nivel={2}
                    concepto={c.nombre}
                    valor={tasa ? c.saldo / tasa : null}
                    detalle={`Bs. ${importe(c.saldo)}`}
                    href={`/cuentas/${c.id}`}
                  />
                ))}
                {!empresaId && (
                  <>
                    <Fila concepto="Caja de efectivo" valor={total(cajas)} />
                    <Fila concepto="Wallets (USDT / USDC)" valor={total(wallets)} />
                    {detalle(wallets)}
                    <Fila concepto="Exchanges" valor={total(exchanges)} />
                    {detalle(exchanges)}
                    <Fila nivel={0} fuerte concepto="Cuentas por cobrar a clientes" valor={porCobrar} detalle={`${deudores.length} subcuentas`} href="/clientes?orden=cobrar" />
                    {deudores.slice(0, 10).map((s) => (
                      <Fila key={s.id} nivel={2} concepto={s.nombre} valor={-s.saldo} href={`/subcuentas/${s.id}`} />
                    ))}
                    {deudores.length > 10 && (
                      <Fila nivel={2} concepto={`Otras ${deudores.length - 10} subcuentas`} valor={-deudores.slice(10).reduce((t, s) => t + s.saldo, 0)} />
                    )}
                  </>
                )}
                <Fila nivel={0} fuerte concepto="TOTAL ACTIVO" valor={activo} />
              </Bloque>

              <Bloque titulo="Pasivo">
                {empresaId ? (
                  <tr>
                    <td colSpan={2} className="py-1.5 pl-4 text-sm text-slate-500">
                      Las cuentas de clientes son del holding: elige «Holding consolidado» para verlas.
                    </td>
                  </tr>
                ) : (
                  <>
                    <Fila nivel={0} fuerte concepto="Saldos a favor de clientes (por pagar)" valor={porPagar} detalle={`${acreedores.length} subcuentas`} href="/clientes?orden=favor" />
                    {acreedores.slice(0, 10).map((s) => (
                      <Fila key={s.id} nivel={2} concepto={s.nombre} valor={s.saldo} href={`/subcuentas/${s.id}`} />
                    ))}
                    {acreedores.length > 10 && (
                      <Fila nivel={2} concepto={`Otras ${acreedores.length - 10} subcuentas`} valor={acreedores.slice(10).reduce((t, s) => t + s.saldo, 0)} />
                    )}
                  </>
                )}
                <Fila nivel={0} fuerte concepto="TOTAL PASIVO" valor={pasivo} />
              </Bloque>

              <Bloque titulo="Patrimonio">
                <tr className="border-t-2 border-slate-900 text-base font-semibold">
                  <td className="py-2">PATRIMONIO NETO (activo − pasivo)</td>
                  <td className={`py-2 text-right tabular-nums ${patrimonio < 0 ? "text-red-700" : ""}`}>{importe(patrimonio)}</td>
                </tr>
              </Bloque>
            </tbody>
          </table>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Composición del activo</h2>
            {sumaPositivas > 0 ? (
              <>
                <div className="flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label="Composición del activo">
                  {positivas.map((x) => (
                    <span key={x.nombre} style={{ width: `${(x.valor / sumaPositivas) * 100}%`, background: x.color }} title={`${x.nombre}: ${importe(x.valor)}`} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {positivas.map((x) => (
                    <li key={x.nombre} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />
                      <span className="flex-1 text-slate-700">{x.nombre}</span>
                      <span className="tabular-nums text-slate-900">{Math.round((x.valor / sumaPositivas) * 100)} %</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-500">Sin activos con saldo positivo.</p>
            )}
          </Tarjeta>
          <Tarjeta className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">Ratios</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Liquidez (disponible / pasivo)</dt>
                <dd className="tabular-nums">{pasivo > 0 ? `${(disponible / pasivo).toFixed(2)}x` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Por cobrar sobre activo</dt>
                <dd className="tabular-nums">{activo > 0 ? `${Math.round((porCobrar / activo) * 100)} %` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">En cripto sobre disponible</dt>
                <dd className="tabular-nums">
                  {disponible > 0 ? `${Math.round(((total(wallets) + total(exchanges)) / disponible) * 100)} %` : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Liquidez por debajo de 1x: lo disponible no alcanza para devolver todos los saldos a favor de clientes.
            </p>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
