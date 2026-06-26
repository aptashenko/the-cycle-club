import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductService } from './product.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  providers: [ProductService],
  exports: [ProductService, TypeOrmModule],
})
export class ProductsModule {}
