import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CorrigirSessaoDto {
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @IsOptional()
  @IsISO8601()
  endedAt?: string;

  // Motivo obrigatorio: correcao sem justificativa nao serve como auditoria.
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
