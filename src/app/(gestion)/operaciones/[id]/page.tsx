import Link from "next/link";
import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, ejecutivos, firmas, operaciones, partidas, subcuentas, usuarios } from "@/db/schema";
import { Seccion } from "@/components/indicadores";
import { Encabezado, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { MONEDAS } from "@/lib/etiquetas";
import { ESTADOS_OPERACION, FIRMAS_REQUERIDAS, TIPOS_OPERACION } from "@/lib/operaciones";
import { FormularioAnular, FormularioEjecutar, FormularioFirma } from "./acciones";

export const metadata = { title: "Operación" };

const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short" });

export default async function PaginaOperacion({ params }: PageProps<"/operaciones/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const autor = alias(usuarios, "autor");
  const [op] = await db
    .select({
      op: operaciones,
      subcuenta: subcuentas.nombre,
      autor: autor.nombre,
    })
    .from(operaciones)
    .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
    .innerJoin(autor, eq(autor.id, operaciones.creadoPor))
    .where(eq(operaciones.id, id))
    .limit(1);
  if (!op) notFound();
  const o = op.op;

  const ejecutor = alias(usuarios, "ejecutor");
  const [lista, listaFirmas, miEjecutivo] = await Promise.all([
    db
      .select({ p: partidas, cuenta: cuentas.nombre, moneda: cuentas.moneda, ejecutor: ejecutor.nombre })
      .from(partidas)
      .leftJoin(cuentas, eq(cuentas.id, partidas.cuentaId))
      .leftJoin(ejecutor, eq(ejecutor.id, partidas.ejecutadaPor))
      .where(eq(partidas.operacionId, id))
      .orderBy(asc(partidas.orden)),
    db
      .select({ f: firmas, ejecutivo: ejecutivos.codigo, usuario: usuarios.nombre })
      .from(firmas)
      .innerJoin(ejecutivos, eq(ejecutivos.id, firmas.ejecutivoId))
      .innerJoin(usuarios, eq(usuarios.id, firmas.usuarioId))
      .where(eq(firmas.operacionId, id))
      .orderBy(asc(firmas.creadoEn)),
    usuario.ejecutivoId
      ? db.select({ codigo: ejecutivos.codigo }).from(ejecutivos).where(eq(ejecutivos.id, usuario.ejecutivoId))
      : Promise.resolve([]),
  ]);

  const estado = ESTADOS_OPERACION[o.estado];
  const yaFirme = listaFirmas.some((f) => f.f.ejecutivoId === usuario.ejecutivoId);
  const puedeFirmar = o.estado === "pendiente_firmas" && Boolean(miEjecutivo[0]) && !yaFirme;
  const puedeEjecutar = (o.estado === "aprobada" || o.estado === "en_ejecucion") && usuario.rol !== "ejecutivo";
  const puedeAnular = (o.estado === "pendiente_firmas" || o.estado === "aprobada") && usuario.rol !== "ejecutivo";
  const aprobaciones = listaFirmas.filter((f) => f.f.aprueba).length;
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Encabezado
        titulo={`Op. ${o.id} · ${TIPOS_OPERACION[o.tipo].nombre}`}
        descripcion={
          <>
            <Insignia color={estado.color}>{estado.nombre}</Insignia> · {fechaCorta(o.fecha)}
            {op.subcuenta && (
              <>
                {" · "}
                <Link className="underline" href={`/subcuentas/${o.subcuentaId}`}>
                  {op.subcuenta}
                </Link>
              </>
            )}{" "}
            · creada por {op.autor}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Monto</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{o.montoUsd ? `US$ ${importe(o.montoUsd)}` : "—"}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tasa</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{o.tasa ? importe(o.tasa) : "—"}</p>
          {o.montoBs && <p className="text-xs text-slate-500">Bs. {importe(o.montoBs)}</p>}
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Utilidad estimada</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{o.utilidad ? `US$ ${importe(o.utilidad)}` : "—"}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Firmas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {aprobaciones} de {FIRMAS_REQUERIDAS}
          </p>
        </Tarjeta>
      </div>

      {o.descripcion && <p className="mb-6 rounded-lg bg-white p-4 text-sm text-slate-700 shadow-sm">{o.descripcion}</p>}
      {o.motivoCierre && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {o.estado === "anulada" ? "Anulada" : "Rechazada"}: {o.motivoCierre}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Partidas</h2>
          <Tabla>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Descripción</Th>
                <Th>Cuenta</Th>
                <Th className="text-right">Importe cuenta</Th>
                <Th className="text-right">Cliente US$</Th>
                <Th>Ejecución</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map(({ p, cuenta, moneda, ejecutor: quien }) => (
                <tr key={p.id} className="align-top">
                  <Td className="tabular-nums text-slate-500">{p.orden}</Td>
                  <Td>{p.descripcion}</Td>
                  <Td>
                    {p.cuentaId ? (
                      <Link href={`/cuentas/${p.cuentaId}`} className="hover:underline">
                        {cuenta}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className={`whitespace-nowrap text-right tabular-nums ${Number(p.importeCuenta) < 0 ? "text-red-700" : ""}`}>
                    {Number(p.importeCuenta) ? `${moneda ? MONEDAS[moneda] : ""} ${importe(p.importeCuenta)}` : "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {Number(p.efectoCliente) ? importe(p.efectoCliente) : "—"}
                  </Td>
                  <Td>
                    {p.ejecutadaEn ? (
                      <span className="text-xs text-emerald-700">
                        ✓ {fechaCorta(p.ejecutadaEn)} · {quien}
                        {p.referencia && <span className="block text-slate-500">Ref. {p.referencia}</span>}
                      </span>
                    ) : puedeEjecutar ? (
                      <FormularioEjecutar partidaId={p.id} hoy={hoy} />
                    ) : (
                      <span className="text-xs text-slate-500">Pendiente</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          {o.estado === "pendiente_firmas" && (
            <p className="mt-2 text-xs text-slate-500">Las partidas se podrán ejecutar cuando la operación tenga las dos firmas.</p>
          )}
        </section>

        <div className="space-y-4">
          <Seccion titulo="Firmas de ejecutivos">
            {listaFirmas.length === 0 && <p className="text-sm text-slate-500">Nadie ha firmado todavía.</p>}
            <ul className="space-y-2 text-sm">
              {listaFirmas.map(({ f, ejecutivo, usuario: quien }) => (
                <li key={f.id}>
                  <span className={f.aprueba ? "text-emerald-700" : "text-red-700"}>{f.aprueba ? "✓ Aprueba" : "✗ Rechaza"}</span>{" "}
                  <span className="font-medium">{ejecutivo}</span> ({quien}) ·{" "}
                  <span className="text-slate-500">{fechaHora.format(f.creadoEn)}</span>
                  {f.comentario && <span className="block text-slate-600">«{f.comentario}»</span>}
                </li>
              ))}
            </ul>
            {puedeFirmar && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <FormularioFirma operacionId={o.id} ejecutivo={miEjecutivo[0].codigo} />
              </div>
            )}
            {o.estado === "pendiente_firmas" && !miEjecutivo[0] && (
              <p className="mt-3 text-xs text-slate-500">Solo firman usuarios vinculados a un ejecutivo.</p>
            )}
            {yaFirme && o.estado === "pendiente_firmas" && (
              <p className="mt-3 text-xs text-slate-500">Ya firmaste. Falta la firma de otro ejecutivo.</p>
            )}
          </Seccion>
          {puedeAnular && (
            <Seccion titulo="Anular">
              <FormularioAnular operacionId={o.id} />
            </Seccion>
          )}
        </div>
      </div>
    </>
  );
}
