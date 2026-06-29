import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { ProductType } from '../common/enums';
import { Product } from './product.entity';

export const THE_CYCLE_SLUG = 'the-cycle';

type ProductSeed = {
  slug: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  type: ProductType;
  isActive: boolean;
};

@Injectable()
export class ProductService implements OnModuleInit {
  private readonly productSeeds = this.loadProductSeeds();

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async onModuleInit() {
    await this.ensureSeedProducts();
  }

  findBySlug(slug: string): Promise<Product | null> {
    return this.productRepository.findOne({ where: { slug, isActive: true } });
  }

  async getTheCycleProduct(): Promise<Product> {
    return this.getActiveProductBySlug(THE_CYCLE_SLUG);
  }

  async getActiveProductBySlug(slug: string): Promise<Product> {
    const product = await this.findBySlug(slug);

    if (!product) {
      return this.ensureProduct(this.getProductSeed(slug));
    }

    return product;
  }

  private async ensureSeedProducts() {
    await Promise.all(
      this.productSeeds.map((productSeed) => this.ensureProduct(productSeed)),
    );
  }

  private async ensureProduct(productSeed: ProductSeed): Promise<Product> {
    let product = await this.productRepository.findOne({
      where: { slug: productSeed.slug },
    });

    if (!product) {
      product = this.productRepository.create({ slug: productSeed.slug });
    }

    product.title = productSeed.title;
    product.description = productSeed.description;
    product.price = productSeed.price;
    product.currency = productSeed.currency;
    product.type = productSeed.type;
    product.isActive = productSeed.isActive;

    return this.productRepository.save(product);
  }

  private getProductSeed(slug: string): ProductSeed {
    const productSeed = this.productSeeds.find((seed) => seed.slug === slug);

    if (!productSeed) {
      throw new Error(`Product seed not found: ${slug}`);
    }

    return productSeed;
  }

  private loadProductSeeds(): ProductSeed[] {
    const productsPath = join(__dirname, 'products.json');
    const products = JSON.parse(readFileSync(productsPath, 'utf8')) as unknown;

    if (!Array.isArray(products)) {
      throw new Error('products.json must contain an array');
    }

    return products.map((product) => this.parseProductSeed(product));
  }

  private parseProductSeed(product: unknown): ProductSeed {
    if (!product || typeof product !== 'object') {
      throw new Error('Invalid product seed');
    }

    const values = product as Record<string, unknown>;
    const productSeed = {
      slug: values.slug,
      title: values.title,
      description: values.description,
      price: values.price,
      currency: values.currency,
      type: values.type ?? ProductType.Subscription,
      isActive: values.isActive,
    };

    for (const [key, value] of Object.entries(productSeed)) {
      if (key === 'isActive') {
        if (typeof value !== 'boolean') {
          throw new Error(`Invalid product seed field: ${key}`);
        }
        continue;
      }

      if (key === 'type') {
        if (
          value !== ProductType.Subscription &&
          value !== ProductType.OneTime
        ) {
          throw new Error(`Invalid product seed field: ${key}`);
        }
        continue;
      }

      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Invalid product seed field: ${key}`);
      }
    }

    return productSeed as ProductSeed;
  }
}
