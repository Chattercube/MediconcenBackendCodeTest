import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ResolveUserDto } from './dto/resolve-user.dto';
import { UserLinksService } from './user-links.service';

@Controller('users')
export class UserLinksController {
  constructor(private readonly userLinksService: UserLinksService) {}

  @Post('resolve')
  @HttpCode(200)
  async resolve(@Body() body: ResolveUserDto) {
    const userID = await this.userLinksService.resolveUserId(
      body.id1,
      body.id2,
    );
    return { userID };
  }
}
