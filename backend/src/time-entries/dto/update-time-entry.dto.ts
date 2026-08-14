import { IsISO8601 } from 'class-validator';

export class UpdateTimeEntryDto {
  @IsISO8601()
  timestamp!: string;
}
