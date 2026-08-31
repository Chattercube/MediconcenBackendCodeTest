import { Module } from '@nestjs/common';
import { UserLinksController } from './user-links.controller';
import { UserLinksService } from './user-links.service';

@Module({
  controllers: [UserLinksController],
  providers: [UserLinksService],
})
export class UserLinksModule {}
