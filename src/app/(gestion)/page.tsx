import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos, movimientos } from "@/db/schema";
import { BarrasDivergentes, GraficoBarras, GraficoLineas } from "@/components/graficos";
import { Indicador, Seccion } from "@/components/indicadores";
import { Encabezado, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { evolucionTesoreria, MONEDAS_DOLAR, saldosCuentas, saldosSubcuentas } from "@/lib/datos";
import { fechaCorta, importe, mesCorto } from "@/lib/dinero";
import { revisionExcel } from "@/lib/revision";

export const metadata = { title: "Inicio" };

const diasDesde = (fecha: string | null, hoy: string) =>
  fecha ? Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86_400_000) : Infinity;

export default async function PaginaInicio() {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const [subs, ctas, evoUsd, evoCripto, revision, miEjecutivo, [futuros]] = await Promise.all([
    saldosSubcuentas(usuario),
    saldosCuentas(),
    evolucionTesoreria(["USD"]),
    evolucionTesoreria(["USDT", "USDC"]),
    revisionExcel(),
    usuario.ejecutivoId
      ? db.select({ codigo: ejecutivos.codigo }).from(ejecutivos).where(eq(ejecutivos.id, usuario.ejecutivoId))
      : Promise.resolve([]),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(movimientos)
      .where(sql`${movimientos.fecha} > current_date`),
  ]);

  const hoy = new Date().toISOString().slice(0, 10);

  const dolares = ctas.filter((c) => MONEDAS_DOLAR.includes(c.moneda)).reduce((t, c) => t + c.saldo, 0);
  const bolivares = ctas.filter((c) => c.moneda === "BS").reduce((t, c) => t + c.saldo, 0);
  const porCobrar = -subs.reduce((t, s) => t + Math.min(0, s.saldo), 0);
  const aFavor = subs.reduce((t, s) => t + Math.max(0, s.saldo), 0);
  const posicionNeta = dolares + porCobrar - aFavor;

  const deudores = subs.filter((s) => s.saldo < -0.005).sort((a, b) => a.saldo - b.saldo);
  const acreedores = subs.filter((s) => s.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
  const top5 = deudores.slice(0, 5).reduce((t, s) => t - s.saldo, 0);

  const porEjecutivo = new Map<string, { cobrar: number; favor: number; subcuentas: number }>();
  for (const s of subs) {
    const e = porEjecutivo.get(s.ejecutivo ?? "Sin asignar") ?? { cobrar: 0, favor: 0, subcuentas: 0 };
    e.subcuentas++;
    if (s.saldo < 0) e.cobrar -= s.saldo;
    else e.favor += s.saldo;
    porEjecutivo.set(s.ejecutivo ?? "Sin asignar", e);
  }
  const miCartera = miEjecutivo[0] ? porEjecutivo.get(miEjecutivo[0].codigo) : undefined;

  const deudoresInactivos = deudores.filter((s) => diasDesde(s.ultimo, hoy) > 60);
  const cuentasQuietas = ctas.filter((c) => c.activa && c.movimientos > 0 && diasDesde(c.ultimo, hoy) > 30);
  const ultimoMes = evoUsd.at(-1)!.mes;
  const cuadran = revision.filter((r) => r.cuadra === true).length;
  const conReferencia = revision.filter((r) => r.cuadra !== null).length;

  const esEjecutivo = usuario.rol === "ejecutivo";

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(" ")[0]}`}
        descripcion={`Posición del holding al ${fechaCorta(hoy)}. Importes en US$ salvo que se indique.`}
      />

      {miCartera && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Indicador titulo={`Tu cartera (${miEjecutivo[0].codigo})`} valor={miCartera.subcuentas} detalle="subcuentas" />
          <Indicador titulo="Tu cartera: por cobrar" valor={importe(miCartera.cobrar)} tono="cobrar" />
          <Indicador titulo="Tu cartera: a favor de clientes" valor={importe(miCartera.favor)} tono="favor" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador titulo="Tesorería en dólares" valor={importe(dolares)} detalle="Bancos US$, caja, wallets y Binance" />
        <Indicador titulo="Tesorería en bolívares" valor={`Bs. ${importe(bolivares)}`} detalle="Bancos en Bs." />
        <Indicador titulo={esEjecutivo ? "Por cobrar (tu cartera)" : "Por cobrar a clientes"} valor={importe(porCobrar)} tono="cobrar" detalle={`${deudores.length} subcuentas`} />
        <Indicador titulo={esEjecutivo ? "A favor (tu cartera)" : "A favor de clientes"} valor={importe(aFavor)} tono="favor" detalle={`${acreedores.length} subcuentas`} />
        <Indicador
          titulo="Posición neta"
          valor={importe(posicionNeta)}
          detalle="Dólares + por cobrar − a favor de clientes"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Saldo de tesorería al cierre de cada mes">
          <GraficoLineas
            series={[
              { nombre: "Bancos y caja (US$)", color: "var(--serie-1)", puntos: evoUsd.map((e) => ({ x: e.mes, y: e.saldo })) },
              { nombre: "Wallets y Binance (USDT/USDC)", color: "var(--serie-2)", puntos: evoCripto.map((e) => ({ x: e.mes, y: e.saldo })) },
            ]}
          />
        </Seccion>
        <Seccion titulo="Entradas y salidas de tesorería en dólares por mes">
          <GraficoBarras
            categorias={evoUsd.map((e) => e.mes)}
            series={[
              { nombre: "Entradas", color: "var(--serie-1)", valores: evoUsd.map((e, i) => e.entradas + evoCripto[i].entradas) },
              { nombre: "Salidas", color: "var(--serie-2)", valores: evoUsd.map((e, i) => e.salidas + evoCripto[i].salidas) },
            ]}
          />
        </Seccion>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Quién nos debe más" acciones={<Link href="/clientes?orden=cobrar" className="text-xs underline">Ver todos</Link>}>
          <BarrasDivergentes
            filas={deudores.slice(0, 10).map((s) => ({ etiqueta: s.nombre, valor: s.saldo, href: `/subcuentas/${s.id}` }))}
          />
        </Seccion>
        <Seccion titulo="A quién debemos más" acciones={<Link href="/clientes?orden=favor" className="text-xs underline">Ver todos</Link>}>
          <BarrasDivergentes
            filas={acreedores.slice(0, 10).map((s) => ({ etiqueta: s.nombre, valor: s.saldo, href: `/subcuentas/${s.id}` }))}
          />
        </Seccion>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Cartera por ejecutivo">
          <Tabla>
            <thead>
              <tr>
                <Th>Ejecutivo</Th>
                <Th className="text-right">Por cobrar</Th>
                <Th className="text-right">A favor</Th>
                <Th className="text-right">Neto</Th>
              </tr>
            </thead>
            <tbody>
              {[...porEjecutivo.entries()]
                .sort((a, b) => b[1].cobrar - a[1].cobrar)
                .map(([codigo, e]) => (
                  <tr key={codigo}>
                    <Td className="whitespace-nowrap font-medium">
                      <Link href={`/clientes?ejecutivo=${encodeURIComponent(codigo)}`} className="hover:underline">
                        {codigo}
                      </Link>
                      <span className="ml-1 text-xs font-normal text-slate-500">({e.subcuentas})</span>
                    </Td>
                    <Td className="text-right tabular-nums text-red-700">{importe(e.cobrar)}</Td>
                    <Td className="text-right tabular-nums text-sky-700">{importe(e.favor)}</Td>
                    <Td className="text-right tabular-nums">{importe(e.favor - e.cobrar)}</Td>
                  </tr>
                ))}
            </tbody>
          </Tabla>
        </Seccion>

        <Seccion titulo="A tener en cuenta">
          <ul className="space-y-3 text-sm text-slate-700">
            {porCobrar > 0 && (
              <li>
                <span className="font-medium">Concentración:</span> los 5 mayores deudores suman{" "}
                <span className="tabular-nums">{importe(top5)}</span>, el{" "}
                <span className="font-medium">{Math.round((top5 / porCobrar) * 100)} %</span> de todo lo que hay por cobrar.
              </li>
            )}
            <li>
              <span className="font-medium">{deudoresInactivos.length} subcuentas con saldo por cobrar</span> llevan más de 60 días sin
              movimiento
              {deudoresInactivos.length > 0 && (
                <>
                  {" "}
                  (suman <span className="tabular-nums">{importe(-deudoresInactivos.reduce((t, s) => t + s.saldo, 0))}</span>):{" "}
                  {deudoresInactivos.slice(0, 4).map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <Link href={`/subcuentas/${s.id}`} className="underline">
                        {s.nombre}
                      </Link>
                    </span>
                  ))}
                  {deudoresInactivos.length > 4 && "…"}
                </>
              )}
              .
            </li>
            <li>
              <span className="font-medium">{cuentasQuietas.length} cuentas de tesorería</span> sin movimientos en los últimos 30 días
              {cuentasQuietas.length > 0 && `: ${cuentasQuietas.slice(0, 4).map((c) => c.nombre).join(", ")}${cuentasQuietas.length > 4 ? "…" : ""}`}.
            </li>
            {futuros.n > 0 && (
              <li>
                <span className="font-medium text-red-700">{futuros.n} movimientos con fecha posterior a hoy</span> (comisiones programadas o erratas en
                el Excel). Revisa las fechas posteriores a hoy en los estados de cuenta.
              </li>
            )}
            <li>
              <span className="font-medium">Último mes ({mesCorto(ultimoMes)}):</span> entraron{" "}
              <span className="tabular-nums">{importe(evoUsd.at(-1)!.entradas + evoCripto.at(-1)!.entradas)}</span> y salieron{" "}
              <span className="tabular-nums">{importe(evoUsd.at(-1)!.salidas + evoCripto.at(-1)!.salidas)}</span> dólares.
            </li>
            {usuario.rol !== "ejecutivo" && conReferencia > 0 && (
              <li>
                <span className="font-medium">Cuadre con los Excel:</span> {cuadran} de {conReferencia} hojas cuadran al céntimo.{" "}
                <Link href="/revision" className="underline">
                  Ver revisión
                </Link>
              </li>
            )}
          </ul>
        </Seccion>
      </div>
    </>
  );
}
