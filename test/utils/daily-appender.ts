import * as log4js from 'log4js';
import * as path from 'path';

const LOG_DIR = path.resolve(__dirname, '..', 'logs');

/**
 * Log4js-based daily file appender.
 *
 * Naming convention (via log4js dateFileAppender):
 *   Today's logs  → test/logs/restify.log
 *   Previous days → test/logs/restify-YYYY-MM-DD.log
 */
log4js.configure({
  appenders: {
    daily: {
      type: 'dateFile',
      filename: path.join(LOG_DIR, 'restify.log'),
      pattern: 'yyyy-MM-dd',
      keepFileExt: true,
      numBackups: 365,
    },
    console: { type: 'console' },
  },
  categories: {
    default: { appenders: ['daily', 'console'], level: 'info' },
  },
});

const logger = log4js.getLogger();

export class DailyFileAppender {
  write(line: string): void {
    logger.info(line);
  }

  writeBanner(label: string): void {
    const ts = new Date().toISOString();
    const sep = '='.repeat(60);
    this.write(`\n${sep}\n${label} — started at ${ts}\n${sep}\n`);
  }

  flush(): void {
    log4js.shutdown();
  }
}

/** Singleton instance shared across all spec files */
export const dailyLog = new DailyFileAppender();
