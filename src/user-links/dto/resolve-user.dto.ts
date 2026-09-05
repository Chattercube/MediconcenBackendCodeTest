import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResolveUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'id1 must contain a non-whitespace character' })
  id1!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'id2 must contain a non-whitespace character' })
  id2!: string;
}
