export type TipoRegistro = "check-in" | "check-out";

export interface Registro {
  tipo: TipoRegistro;
  horario: Date;
}
