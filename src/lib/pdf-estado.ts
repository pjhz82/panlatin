import "server-only";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { hojaDeCuenta } from "./datos";
import { fechaCorta, importe } from "./dinero";

/** jsPDF con las fuentes estándar solo admite Latin-1: se sustituye lo demás. */
const latin1 = (t: string | null | undefined) =>
  (t ?? "").replace(/[‐-―]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");

/**
 * PDF del estado de cuenta de una subcuenta, listo para enviar al cliente.
 * Si hay periodo, arranca con el saldo anterior a «desde».
 */
export async function pdfEstadoDeCuenta(opciones: {
  subcuentaId: number;
  nombre: string;
  cliente: string;
  desde?: string;
  hasta?: string;
}): Promise<ArrayBuffer> {
  const { desde, hasta } = opciones;
  const todas = await hojaDeCuenta({ subcuentaId: opciones.subcuentaId });
  const anteriores = desde ? todas.filter((f) => f.fecha < desde) : [];
  const filas = todas.filter((f) => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta));
  const saldoInicial = anteriores.at(-1)?.saldo ?? 0;
  const cargos = filas.reduce((t, f) => t + Math.max(0, -f.importe), 0);
  const abonos = filas.reduce((t, f) => t + Math.max(0, f.importe), 0);
  const saldoFinal = saldoInicial + abonos - cargos;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const ancho = doc.internal.pageSize.getWidth();
  const hoy = new Date().toISOString().slice(0, 10);
  const periodo =
    desde || hasta
      ? `Del ${desde ? fechaCorta(desde) : "inicio"} al ${hasta ? fechaCorta(hasta) : fechaCorta(hoy)}`
      : `Todos los movimientos hasta el ${fechaCorta(hoy)}`;

  // Cabecera
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(100);
  doc.text("PANLATIN · TESORERÍA", 14, 14);
  doc.setFontSize(18).setTextColor(15, 23, 42);
  doc.text("Estado de cuenta", 14, 23);
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(latin1(opciones.nombre), 14, 30);
  doc.setFontSize(9).setTextColor(100);
  doc.text(latin1(`Cliente: ${opciones.cliente} · ${periodo} · Importes en US$`), 14, 35);
  doc.text(`Emitido el ${fechaCorta(hoy)}`, ancho - 14, 14, { align: "right" });

  // Totales del periodo, en la primera página
  const etiquetaSaldo = saldoFinal < -0.005 ? "Saldo final (pendiente de pago)" : saldoFinal > 0.005 ? "Saldo final (a su favor)" : "Saldo final";
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(15, 23, 42);
  doc.text("TOTALES DEL PERIODO", 14, 43);
  autoTable(doc, {
    startY: 45,
    theme: "grid",
    styles: { fontSize: 8, halign: "center", lineColor: [203, 213, 225], lineWidth: 0.2, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "normal" },
    bodyStyles: { fontSize: 12, fontStyle: "bold", textColor: [15, 23, 42] },
    head: [["Saldo inicial", "Total cargos", "Total abonos", "Movimientos", etiquetaSaldo]],
    body: [[importe(saldoInicial), importe(cargos), importe(abonos), String(filas.length), importe(Math.abs(saldoFinal))]],
    didParseCell: (c) => {
      if (c.section === "body" && c.column.index === 4) {
        c.cell.styles.textColor = saldoFinal < -0.005 ? [185, 28, 28] : [3, 105, 161];
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Movimientos
  const cuerpo: string[][] = [];
  if (desde) cuerpo.push([fechaCorta(desde), "Saldo anterior", "", "", "", "", importe(saldoInicial)]);
  let saldo = saldoInicial;
  for (const f of filas) {
    saldo += f.importe;
    cuerpo.push([
      fechaCorta(f.fecha),
      latin1(f.concepto),
      latin1(f.detalle),
      latin1(f.formaPago),
      f.importe < 0 ? importe(-f.importe) : "",
      f.importe > 0 ? importe(f.importe) : "",
      importe(saldo),
    ]);
  }
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
    head: [["Fecha", "Concepto", "Pagado a / por", "Forma de pago", "Cargos", "Abonos", "Saldo"]],
    body: cuerpo.length ? cuerpo : [["", "Sin movimientos en el periodo", "", "", "", "", ""]],
    foot: [["", "", "", "Totales", importe(cargos), importe(abonos), importe(saldoFinal)]],
    theme: "striped",
    showFoot: "lastPage",
    showHead: "everyPage",
    didParseCell: (c) => {
      if (c.column.index >= 4) c.cell.styles.halign = "right";
    },
    styles: { fontSize: 8, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 45 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 42 },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
      6: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
      doc.text(latin1(`${opciones.nombre} · ${periodo}`), 14, alto - 8);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, ancho - 14, alto - 8, { align: "right" });
    },
  });

  // Nota final
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (finalY < doc.internal.pageSize.getHeight() - 26) {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100);
    doc.text(
      "Saldo positivo: a favor del cliente. Saldo negativo: pendiente de pago por el cliente. Ante cualquier diferencia, contacte con su ejecutivo.",
      14,
      finalY + 8,
    );
  }
  return doc.output("arraybuffer");
}

/** Nombre de archivo seguro para la cabecera Content-Disposition. */
export function cabeceraDescarga(nombre: string) {
  const ascii = nombre.normalize("NFKD").replace(/[^\w .-]/g, "").trim() || "estado-de-cuenta";
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`;
}
