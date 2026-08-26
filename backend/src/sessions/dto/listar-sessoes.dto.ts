import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListarSessoesDto {
  // Cursor e o id da ultima sessao da pagina anterior.
  @IsOptional()
  @IsUUID()
  cursor?: string;

  // Query string chega como texto; o Type converte antes de validar.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}
