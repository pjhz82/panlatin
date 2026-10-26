import type { Moneda, Red, Rol, TipoCuenta } from "@/db/schema";

export const ROLES: Record<Rol, string> = {
  admin: "Administrador",
  ejecutivo: "Ejecutivo (solo su cartera)",
  operadora: "Operadora",
  cliente: "Cliente",
};

export const TIPOS_CUENTA: Record<TipoCuenta, string> = {
  banco: "Banco",
  wallet: "Wallet",
  exchange: "Exchange",
  caja: "Caja de efectivo",
};

export const MONEDAS: Record<Moneda, string> = {
  BS: "Bs.",
  USD: "US$",
  USDT: "USDT",
  USDC: "USDC",
};

export const REDES: Record<Red, string> = {
  TRON: "TRON (TRC-20)",
  ETH: "Ethereum (ERC-20)",
};

/** Enlace al explorador público de la wallet. */
export function urlExplorador(red: Red, direccion: string) {
  return red === "TRON"
    ? `https://tronscan.org/#/address/${direccion}`
    : `https://etherscan.io/address/${direccion}`;
}

/** Dirección abreviada: TXCu…MT25L */
export const abreviar = (direccion: string) =>
  direccion.length > 14 ? `${direccion.slice(0, 4)}…${direccion.slice(-5)}` : direccion;
