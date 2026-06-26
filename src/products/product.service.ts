import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';

export const THE_CYCLE_SLUG = 'the-cycle';

@Injectable()
export class ProductService implements OnModuleInit {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async onModuleInit() {
    await this.ensureTheCycleProduct();
  }

  findBySlug(slug: string): Promise<Product | null> {
    return this.productRepository.findOne({ where: { slug, isActive: true } });
  }

  async getTheCycleProduct(): Promise<Product> {
    const product = await this.findBySlug(THE_CYCLE_SLUG);

    if (!product) {
      return this.ensureTheCycleProduct();
    }

    return product;
  }

  private async ensureTheCycleProduct(): Promise<Product> {
    let product = await this.productRepository.findOne({
      where: { slug: THE_CYCLE_SLUG },
    });

    if (!product) {
      product = this.productRepository.create({ slug: THE_CYCLE_SLUG });
    }

    product.title = 'The Cycle';
    product.description =
      'Женский клуб с поддержкой эксперта, материалами, эфирами и сообществом для бережного движения по своим циклам и этапам.';
    product.price = product.price ?? '1.00';
    product.currency = product.currency ?? 'UAH';
    product.isActive = true;

    return this.productRepository.save(product);
  }
}
