import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, usuarios } from "@/db/schema";
import { BotonEnlace, Encabezado, EstadoActivo, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { ROLES } from "@/lib/etiquetas";

export const metadata = { title: "Usuarios" };

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" });

export default async function PaginaUsuarios() {
  await requerirUsuario(["admin"]);
  const filas = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarios.rol,
      activo: usuarios.activo,
      ultimoAcceso: usuarios.ultimoAcceso,
      ejecutivo: ejecutivos.codigo,
      cliente: clientes.nombre,
    })
    .from(usuarios)
    .leftJoin(ejecutivos, eq(ejecutivos.id, usuarios.ejecutivoId))
    .leftJoin(clientes, eq(clientes.id, usuarios.clienteId))
    .orderBy(asc(usuarios.rol), asc(usuarios.nombre));

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion="Ejecutivos, operadoras y clientes con acceso a la web."
        acciones={<BotonEnlace href="/usuarios/nuevo">Nuevo usuario</BotonEnlace>}
      />
      <Tabla>
        <thead>
          <tr>
            <Th>Nombre</Th>
            <Th>Correo</Th>
            <Th>Rol</Th>
            <Th>Último acceso</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={5} texto="Todavía no hay usuarios." />}
          {filas.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/usuarios/${u.id}`} className="font-medium hover:underline">
                  {u.nombre}
                </Link>
              </Td>
              <Td>{u.email}</Td>
              <Td>
                {ROLES[u.rol]}
                {u.ejecutivo && <span className="text-slate-500"> · {u.ejecutivo}</span>}
                {u.cliente && <span className="text-slate-500"> · {u.cliente}</span>}
              </Td>
              <Td className="text-slate-500">{u.ultimoAcceso ? fecha.format(u.ultimoAcceso) : "Nunca"}</Td>
              <Td>
                <EstadoActivo activo={u.activo} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
