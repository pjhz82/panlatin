"use client";

import { Boton } from "@/components/ui";

export function BotonImprimir() {
  return (
    <Boton type="button" variante="secundario" onClick={() => window.print()} className="print:hidden">
      Imprimir / PDF
    </Boton>
  );
}
