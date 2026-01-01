export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = "SeedEngine", level: LogLevel = LogLevel.INFO) {
    this.prefix = prefix;
    this.level = level;
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const color = this.getColor(level);
    const reset = "\x1b[0m";

    let output = `${color}[${timestamp}] [${this.prefix}] [${levelName}]${reset} ${message}`;

    if (data !== undefined) {
      output += " " + JSON.stringify(data, null, 2);
    }

    console.log(output);
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return "\x1b[36m"; // Cyan
      case LogLevel.INFO:
        return "\x1b[32m"; // Green
      case LogLevel.WARN:
        return "\x1b[33m"; // Yellow
      case LogLevel.ERROR:
        return "\x1b[31m"; // Red
      default:
        return "\x1b[0m"; // Reset
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any) {
    this.log(LogLevel.ERROR, message, data);
  }

  section(title: string) {
    const separator = "=".repeat(60);
    this.info(`\n${separator}`);
    this.info(title);
    this.info(separator);
  }

  subsection(title: string) {
    this.info(`\n--- ${title} ---`);
  }

  anomaly(message: string, data?: any) {
    this.warn(`🚨 ANOMALY DETECTED: ${message}`, data);
  }

  success(message: string, data?: any) {
    this.info(`✅ ${message}`, data);
  }

  progress(current: number, total: number, message: string) {
    const percentage = Math.round((current / total) * 100);
    this.info(`[${percentage}%] ${message} (${current}/${total})`);
  }
}

export const createLogger = (prefix: string = "SeedEngine") => {
  const levelEnv = process.env.LOG_LEVEL?.toUpperCase();
  const level = LogLevel[levelEnv as keyof typeof LogLevel] || LogLevel.INFO;
  return new Logger(prefix, level);
};
