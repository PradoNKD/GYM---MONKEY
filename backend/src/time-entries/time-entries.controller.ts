import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TimeEntriesService } from './time-entries.service';

@Controller('time-entries')
@UseGuards(JwtAuthGuard)
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.timeEntriesService.findAllForUser(user.id);
  }

  @Post('toggle')
  toggle(@CurrentUser() user: AuthenticatedUser) {
    return this.timeEntriesService.toggle(user.id);
  }
}
