import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, subcuentas, usuarios } from "@/db/schema";
import { Encabezado, EstadoActivo, FilaVacia, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { filtroClientes, filtroSubcuentas, puedeEditarClientes } from "@/lib/alcance";
import { saldosSubcuentas } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";
import { BarrasDivergentes } from "@/components/graficos";
import { Indicador } from "@/components/indicadores";
import Link from "next/link";
import { FormularioCliente, FormularioSubcuenta } from "../formularios";

export const metadata = { title: "Cliente" };

export default async function PaginaCliente({ params }: PageProps<"/clientes/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [cliente] = await db
    .select({
      id: clientes.id,
      nombre: clientes.nombre,
      ejecutivoId: clientes.ejecutivoId,
      notas: clientes.notas,
      activo: clientes.activo,
      ejecutivo: ejecutivos.codigo,
    })
    .from(clientes)
    .leftJoin(ejecutivos, eq(ejecutivos.id, clientes.ejecutivoId))
    .where(and(eq(clientes.id, id), filtroClientes(usuario)))
    .limit(1);
  if (!cliente) notFound();

  const editable = puedeEditarClientes(usuario);
  const [saldos, listaSubcuentas, listaEjecutivos, accesos] = await Promise.all([
    saldosSubcuentas(usuario, eq(subcuentas.clienteId, id)),
    db
      .select({
        id: subcuentas.id,
        nombre: subcuentas.nombre,
        ejecutivoId: subcuentas.ejecutivoId,
        activa: subcuentas.activa,
        ejecutivo: ejecutivos.codigo,
      })
      .from(subcuentas)
      .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
      .leftJoin(ejecutivos, eq(ejecutivos.id, subcuentas.ejecutivoId))
      .where(and(eq(subcuentas.clienteId, id), filtroSubcuentas(usuario)))
      .orderBy(asc(subcuentas.nombre)),
    db
      .select({ id: ejecutivos.id, codigo: ejecutivos.codigo, nombre: ejecutivos.nombre })
      .from(ejecutivos)
      .where(eq(ejecutivos.activo, true))
      .orderBy(asc(ejecutivos.codigo)),
    usuario.rol === "admin"
      ? db
          .select({ id: usuarios.id, nombre: usuarios.nombre, usuario: usuarios.usuario, activo: usuarios.activo })
          .from(usuarios)
          .where(eq(usuarios.clienteId, id))
      : Promise.resolve([]),
  ]);

  const saldoDe = new Map(saldos.map((x) => [x.id, x]));
  const total = saldos.reduce((t, x) => t + x.saldo, 0);
  const porCobrar = saldos.reduce((t, x) => t + Math.min(0, x.saldo), 0);
  const aFavor = saldos.reduce((t, x) => t + Math.max(0, x.saldo), 0);

  return (
    <>
      <Encabezado
        titulo={cliente.nombre}
        descripcion={
          <>
            Ejecutivo: {cliente.ejecutivo ?? "sin asignar"} · <EstadoActivo activo={cliente.activo} />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador
          titulo={total >= 0 ? "Saldo neto a favor del cliente" : "Saldo neto por cobrar"}
          valor={`US$ ${importe(Math.abs(total))}`}
          tono={total >= 0 ? "favor" : "cobrar"}
        />
        <Indicador titulo="Por cobrar" valor={importe(-porCobrar)} tono="cobrar" detalle="Suma de subcuentas en negativo" />
        <Indicador titulo="A favor del cliente" valor={importe(aFavor)} tono="favor" detalle="Suma de subcuentas en positivo" />
      </div>
      {saldos.filter((x) => Math.abs(x.saldo) > 0.005).length > 1 && (
        <Tarjeta className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold">Saldo por subcuenta (US$)</h2>
          <BarrasDivergentes
            filas={saldos
              .filter((x) => Math.abs(x.saldo) > 0.005)
              .sort((a, b) => a.saldo - b.saldo)
              .map((x) => ({ etiqueta: x.nombre, valor: x.saldo, href: `/subcuentas/${x.id}` }))}
          />
          <p className="mt-2 text-xs text-slate-500">Rojo: por cobrar · Azul: a favor del cliente</p>
        </Tarjeta>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Subcuentas</h2>
        <p className="mb-3 text-sm text-slate-500">
          Cada subcuenta lleva su propio estado de cuenta, como si fuera un cliente distinto. Si no tiene
          ejecutivo propio, usa el del cliente.
        </p>
        <Tabla>
          <thead>
            <tr>
              <Th>Subcuenta</Th>
              <Th>Ejecutivo</Th>
              <Th className="text-right">Saldo US$</Th>
              <Th>Último mov.</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {listaSubcuentas.length === 0 && <FilaVacia columnas={5} texto="Sin subcuentas." />}
            {listaSubcuentas.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/subcuentas/${s.id}`} className="font-medium hover:underline">
                    {s.nombre}
                  </Link>
                  {editable && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-500">Editar</summary>
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <FormularioSubcuenta clienteId={cliente.id} subcuenta={s} ejecutivos={listaEjecutivos} />
                      </div>
                    </details>
                  )}
                </Td>
                <Td>
                  {s.ejecutivo ?? (
                    <span className="text-slate-500">{cliente.ejecutivo ?? "—"} (del cliente)</span>
                  )}
                </Td>
                <Td
                  className={`text-right tabular-nums ${(saldoDe.get(s.id)?.saldo ?? 0) < -0.005 ? "text-red-700" : (saldoDe.get(s.id)?.saldo ?? 0) > 0.005 ? "text-sky-700" : "text-slate-500"}`}
                >
                  {importe(saldoDe.get(s.id)?.saldo ?? 0)}
                </Td>
                <Td className="text-slate-500">
                  {saldoDe.get(s.id)?.ultimo ? fechaCorta(saldoDe.get(s.id)!.ultimo!) : "—"}
                </Td>
                <Td>
                  <EstadoActivo activo={s.activa} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        {editable && (
          <Tarjeta className="mt-4 p-4">
            <p className="mb-3 text-sm font-medium">Añadir subcuenta</p>
            <FormularioSubcuenta clienteId={cliente.id} ejecutivos={listaEjecutivos} />
          </Tarjeta>
        )}
      </section>

      {usuario.rol === "admin" && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Acceso al portal</h2>
          {accesos.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este cliente todavía no tiene usuario. Créalo en Usuarios con el rol Cliente.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {accesos.map((a) => (
                <li key={a.id}>
                  {a.nombre} · usuario «{a.usuario}» {!a.activo && <Insignia>Inactivo</Insignia>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editable && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Datos del cliente</h2>
          <FormularioCliente cliente={cliente} ejecutivos={listaEjecutivos} />
        </section>
      )}
    </>
  );
}
