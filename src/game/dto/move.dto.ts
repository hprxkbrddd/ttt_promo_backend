import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type Cell = 0 | 1 | 2;

export class MoveDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sessionId?: string;

  @IsArray()
  @IsInt({ each: true })
  board!: Cell[];

  @IsInt()
  cellIndex!: number; // 0..8
}
