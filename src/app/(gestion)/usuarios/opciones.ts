import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos } from "@/db/schema";

export const opcionesUsuario = () =>
  Promise.all([
    db
      .select({ id: ejecutivos.id, codigo: ejecutivos.codigo, nombre: ejecutivos.nombre })
      .from(ejecutivos)
      .orderBy(asc(ejecutivos.codigo)),
    db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).orderBy(asc(clientes.nombre)),
  ]);
