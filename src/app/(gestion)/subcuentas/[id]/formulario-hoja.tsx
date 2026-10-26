"use client";

import { useActionState, useState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Entrada, Selector } from "@/components/ui";
import type { Moneda } from "@/db/schema";
import { estadoInicial } from "@/lib/formularios";
import { registrarEnHoja } from "./actions";

const CONCEPTOS = ["Operación", "Pago operación", "Comisión", "Préstamo", "Swap", "Traspaso", "Transferencia recibida", "Gastos"];
const SIMBOLO: Record<Moneda, string> = { BS: "Bs.", USD: "US$", USDT: "USDT", USDC: "USDC" };

export function FormularioHoja({
  subcuentaId,
  cuentas,
  hoy,
}: {
  subcuentaId: number;
  cuentas: { id: number; nombre: string; moneda: Moneda }[];
  hoy: string;
}) {
  const [estado, accion] = useActionState(registrarEnHoja.bind(null, subcuentaId), estadoInicial);
  const [cuentaId, setCuentaId] = useState("");
  const enBs = cuentas.find((c) => String(c.id) === cuentaId)?.moneda === "BS";

  return (
    <Formulario accion={accion} estado={estado} reiniciarTrasExito className="space-y-2">
      <div className="grid gap-2 md:grid-cols-[8.5rem_1.2fr_1.4fr_1.4fr_7rem_7rem]">
        <Entrada type="date" name="fecha" defaultValue={hoy} required aria-label="Fecha" />
        <Entrada name="concepto" list="conceptos-hoja" placeholder="Concepto" required aria-label="Concepto" />
        <datalist id="conceptos-hoja">
          {CONCEPTOS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Entrada name="pagadoA" placeholder="Pagado a / por" aria-label="Pagado a / por" />
        <Selector name="cuentaId" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} aria-label="Forma de pago">
          <option value="">Forma de pago: sin cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({SIMBOLO[c.moneda]})
            </option>
          ))}
        </Selector>
        <Entrada name="cargo" inputMode="decimal" placeholder="Cargo US$" className="text-right" aria-label="Cargo" />
        <Entrada name="abono" inputMode="decimal" placeholder="Abono US$" className="text-right" aria-label="Abono" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {enBs && <Entrada name="tasa" inputMode="decimal" placeholder="Tasa Bs./US$" className="w-36" required />}
        <Entrada name="referencia" placeholder="Referencia (opcional)" className="w-52" />
        <BotonGuardar texto="Registrar" />
        {estado.error && <span className="text-sm text-red-700">{estado.error}</span>}
        {estado.ok && <span className="text-sm text-emerald-700">Registrado. Queda pendiente de dos firmas y se aplicará al aprobarse.</span>}
      </div>
    </Formulario>
  );
}
