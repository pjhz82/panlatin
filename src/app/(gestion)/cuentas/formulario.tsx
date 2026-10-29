"use client";

import { useActionState, useState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, BotonEnlace, Campo, Casilla, Entrada, Selector, Tarjeta } from "@/components/ui";
import type { Moneda, Red, TipoCuenta } from "@/db/schema";
import { MONEDAS, REDES, TIPOS_CUENTA } from "@/lib/etiquetas";
import { estadoInicial } from "@/lib/formularios";
import { guardarCuenta } from "./actions";

type Cuenta = {
  id: number;
  nombre: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  empresaId: number | null;
  entidad: string | null;
  numero: string | null;
  red: Red | null;
  direccion: string | null;
  limiteInterbancario: string | null;
  activa: boolean;
};

export function FormularioCuenta({
  cuenta,
  empresas,
}: {
  cuenta?: Cuenta;
  empresas: { id: number; nombre: string }[];
}) {
  const [estado, accion] = useActionState(guardarCuenta.bind(null, cuenta?.id ?? null), estadoInicial);
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? "banco");
  const e = estado.errores ?? {};

  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} estado={estado} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Tipo" error={e.tipo}>
            <Selector name="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as TipoCuenta)}>
              {Object.entries(TIPOS_CUENTA).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Moneda" error={e.moneda}>
            <Selector name="moneda" defaultValue={cuenta?.moneda ?? (tipo === "wallet" ? "USDT" : "BS")} key={tipo}>
              {Object.entries(MONEDAS)
                .filter(([valor]) => tipo !== "wallet" || valor === "USDT" || valor === "USDC")
                .map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
            </Selector>
          </Campo>
        </div>
        <Campo
          etiqueta="Nombre"
          error={e.nombre}
          ayuda="Como lo llamáis: «BDV Panlatin», «PH - USDT (MT25L)», «Caja principal»…"
        >
          <Entrada name="nombre" defaultValue={cuenta?.nombre} required />
        </Campo>
        <Campo etiqueta={tipo === "banco" ? "Empresa titular" : "Empresa (opcional)"} error={e.empresaId}>
          <Selector name="empresaId" defaultValue={cuenta?.empresaId ?? ""}>
            <option value="">—</option>
            {empresas.map((em) => (
              <option key={em.id} value={em.id}>
                {em.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        {(tipo === "banco" || tipo === "exchange") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta={tipo === "banco" ? "Banco" : "Exchange"} error={e.entidad}>
              <Entrada
                name="entidad"
                defaultValue={cuenta?.entidad ?? ""}
                placeholder={tipo === "banco" ? "BDV, Banesco, Wise…" : "Binance"}
              />
            </Campo>
            {tipo === "banco" && (
              <Campo etiqueta="Nº de cuenta (últimos dígitos)" error={e.numero}>
                <Entrada name="numero" defaultValue={cuenta?.numero ?? ""} placeholder="…1234" />
              </Campo>
            )}
            {tipo === "banco" && (
              <Campo etiqueta="Límite diario interbancario" error={e.limiteInterbancario} ayuda="En la moneda de la cuenta. Vacío: sin límite.">
                <Entrada
                  name="limiteInterbancario"
                  inputMode="decimal"
                  defaultValue={cuenta?.limiteInterbancario ? String(Number(cuenta.limiteInterbancario)) : ""}
                  placeholder="2000000"
                />
              </Campo>
            )}
          </div>
        )}
        {tipo === "wallet" && (
          <>
            <Campo etiqueta="Red" error={e.red}>
              <Selector name="red" defaultValue={cuenta?.red ?? "TRON"}>
                {Object.entries(REDES).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Dirección" error={e.direccion}>
              <Entrada name="direccion" defaultValue={cuenta?.direccion ?? ""} className="font-mono" required />
            </Campo>
          </>
        )}
        {cuenta && <Casilla name="activa" etiqueta="Activa" defaultChecked={cuenta.activa} />}
        <div className="flex gap-2 pt-2">
          <BotonGuardar />
          <BotonEnlace href="/cuentas" variante="secundario">
            Cancelar
          </BotonEnlace>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
