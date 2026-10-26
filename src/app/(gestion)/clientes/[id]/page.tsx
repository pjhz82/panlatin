import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, subcuentas, usuarios } from "@/db/schema";
import { Encabezado, EstadoActivo, FilaVacia, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { filtroClientes, filtroSubcuentas, puedeEditarClientes } from "@/lib/alcance";
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
  const [listaSubcuentas, listaEjecutivos, accesos] = await Promise.all([
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
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {listaSubcuentas.length === 0 && <FilaVacia columnas={3} texto="Sin subcuentas." />}
            {listaSubcuentas.map((s) => (
              <tr key={s.id}>
                <Td>
                  {editable ? (
                    <details>
                      <summary className="cursor-pointer font-medium">{s.nombre}</summary>
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <FormularioSubcuenta clienteId={cliente.id} subcuenta={s} ejecutivos={listaEjecutivos} />
                      </div>
                    </details>
                  ) : (
                    <span className="font-medium">{s.nombre}</span>
                  )}
                </Td>
                <Td>
                  {s.ejecutivo ?? (
                    <span className="text-slate-500">{cliente.ejecutivo ?? "—"} (del cliente)</span>
                  )}
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
