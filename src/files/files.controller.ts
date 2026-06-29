import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { basename, extname, join } from 'path';
import { Response } from 'express';

@Controller('files')
export class FilesController {
  @Get(':filename')
  getFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (filename !== basename(filename)) {
      throw new NotFoundException('File not found');
    }

    const filePath = join(process.cwd(), 'files', filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    response.set({
      'Content-Type': this.getContentType(filename),
      'Content-Disposition': `inline; filename="${filename.replaceAll('"', '')}"`,
    });

    return new StreamableFile(createReadStream(filePath));
  }

  private getContentType(filename: string): string {
    if (extname(filename).toLowerCase() === '.pdf') {
      return 'application/pdf';
    }

    return 'application/octet-stream';
  }
}
