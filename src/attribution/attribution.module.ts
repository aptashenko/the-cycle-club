import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributionController } from './attribution.controller';
import { AttributionService } from './attribution.service';
import { TelegramAttribution } from './telegram-attribution.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([TelegramAttribution])],
  controllers: [AttributionController],
  providers: [AttributionService],
  exports: [AttributionService, TypeOrmModule],
})
export class AttributionModule {}
