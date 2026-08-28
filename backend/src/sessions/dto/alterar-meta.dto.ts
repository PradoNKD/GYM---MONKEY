import { IsInt, Max, Min } from 'class-validator';
import { META_MAX, META_MIN } from '../semanas';

export class AlterarMetaDto {
  // Dias distintos com treino contavel por semana. O teto existe para a meta
  // continuar sendo um habito sustentavel, e o piso para nao virar decorativa.
  @IsInt()
  @Min(META_MIN)
  @Max(META_MAX)
  meta!: number;
}
