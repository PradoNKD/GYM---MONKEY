import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NOME_MAX, PESO_MAX_G, REPS_MAX, REPS_MIN, SERIES_MAX_POR_EXERCICIO } from '../exercicios';

export class SerieDto {
  @IsInt()
  @Min(REPS_MIN)
  @Max(REPS_MAX)
  reps!: number;

  /**
   * Gramas, inteiro. `null` e **peso do corpo**, nao zero -- e a distincao
   * importa: serie sem carga fica fora do volume, em vez de somar zero.
   */
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(0)
  @Max(PESO_MAX_G)
  pesoG!: number | null;
}

export class SalvarSeriesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(NOME_MAX)
  exercicio!: string;

  /**
   * A lista INTEIRA de series daquele exercicio no treino. Mandar o estado
   * final, e nao um acrescimo, e o que permite apagar a 3a serie sem uma rota
   * propria para remover serie por serie.
   */
  @IsArray()
  @ArrayMaxSize(SERIES_MAX_POR_EXERCICIO)
  @ValidateNested({ each: true })
  @Type(() => SerieDto)
  series!: SerieDto[];
}
