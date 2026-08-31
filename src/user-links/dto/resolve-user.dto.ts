import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  id1!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  id2!: string;
}
