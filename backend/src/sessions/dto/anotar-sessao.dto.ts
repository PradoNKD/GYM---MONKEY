import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { WorkoutType } from '@prisma/client';
import { ESFORCO_MAX, ESFORCO_MIN, MAX_TIPOS, NOTA_MAX } from '../registro';

/**
 * Registro de treino da Fase A. Todo campo e opcional -- inclusive mandar o
 * corpo vazio, que simplesmente nao muda nada.
 *
 * `null` e aceito de proposito em todos eles: e assim que a tela LIMPA um campo
 * que a pessoa preencheu por engano. Campo ausente nao mexe no que ja estava.
 */
export class AnotarSessaoDto {
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsArray()
  @ArrayMaxSize(MAX_TIPOS)
  @IsEnum(WorkoutType, { each: true })
  workoutTypes?: WorkoutType[] | null;

  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(ESFORCO_MIN)
  @Max(ESFORCO_MAX)
  effort?: number | null;

  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @MaxLength(NOTA_MAX)
  note?: string | null;
}
