import type { UserDto } from '../../../common/dto/user.dto';
import type { GigId } from '../../../gig/dto/gig.dto';

interface CreateGigDto {
  title: string;
  date: string;
  location: string;
  ticketsUrl: string;
}

export interface V1TelegramCreateGigRequestBody {
  gig: CreateGigDto;
  telegramInitDataString: string;
}

export interface V1TelegramCreateGigRequestBodyValidated {
  gig: CreateGigDto;
  user: UserDto;
}

export interface V1TelegramApproveGigRequestBody {
  gigId: GigId;
}
