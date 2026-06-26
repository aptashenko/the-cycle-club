import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CriticalErrorService } from '../notifications/critical-error.service';

@Catch()
export class CriticalErrorFilter implements ExceptionFilter {
  constructor(private readonly criticalErrors: CriticalErrorService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      void this.criticalErrors.notify({
        source: 'http',
        message: this.getMessage(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
        details: {
          method: request.method,
          url: request.originalUrl,
          status,
        },
      });
    }

    response.status(status).json({
      statusCode: status,
      message: this.getPublicMessage(exception),
      error: status >= 500 ? 'Internal Server Error' : undefined,
    });
  }

  private getMessage(exception: unknown) {
    if (exception instanceof Error) {
      return exception.message;
    }

    return String(exception);
  }

  private getPublicMessage(exception: unknown) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        return (response as { message: unknown }).message;
      }
    }

    return 'Internal server error';
  }
}
