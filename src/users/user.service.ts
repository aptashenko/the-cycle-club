import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramUser } from '../bot/telegram.types';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async upsertTelegramUser(from: TelegramUser): Promise<User> {
    const telegramId = String(from.id);
    let user = await this.userRepository.findOne({ where: { telegramId } });

    if (!user) {
      user = this.userRepository.create({ telegramId });
    }

    user.username = from.username;
    user.firstName = from.first_name;
    user.lastName = from.last_name;
    user.languageCode = from.language_code;

    return this.userRepository.save(user);
  }

  findByTelegramId(telegramId: string | number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { telegramId: String(telegramId) },
    });
  }
}
