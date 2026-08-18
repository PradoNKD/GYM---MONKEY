import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
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

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timeEntriesService.update(user.id, id, dto.timestamp);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeEntriesService.remove(user.id, id);
  }
}
