export type LogLevel = Exclude<keyof Logger, "setContext">;

type LoggerConfig = {
  level: LogLevel;

  /**
   * optional prefix to inject before all message logs
   */
  prefix?: string;

  /**
   * the context will be appended to all logged statements, and should be used
   * to provide developers with additional details about the origin of the logs
   *
   * @example
   * new Logger({
   *   // ...
   *   context: {
   *     app: "mirror",
   *     projectId: "id",
   *     networkId: "id"
   *   }
   * })
   */
  context?: Record<string, string>;

  /**
   * if provided, this hook will be triggered on all relevant log statements
   * prior to printing the statement to the console.
   *
   * this is useful in durable objects, where we wish to stream log statements
   * to event sources for external consumption purposes.
   */
  hook?: (level: LogLevel, message: string) => void;
};

/**
 * core signature for logging statements
 *
 * we're carefully forcing an explicit signature for logs, so that they are
 * consistent and easily filterable in production environments for easier
 * debugging of live issues
 *
 * @param callerName - provide a fully qualified name of the function printing the log statement, so it is easy to re-trace the origin of log statements when doing debugging
 * @param message - the actual message to be printed (this will be merged with the caller name, and is included when log statements are emitted as events)
 * @param additionalData - if any additional data is needed for the logs, include them as extra arguments and they'll be printed after the message
 *
 * @example
 * log("sendMail", "couldn't connect to mailtrap.io", { err });
 * // --> sendMail: couldn't connect to mailtrap.io { err: { ... } }
 */
type LogFn = (callerName: string, message: string, ...additionalData: unknown[]) => void;

/**
 * logger instance which automatically adds desired prefixes and contexts to
 * all output statements, and adds support for supplying a hook to intercept
 * and process logs
 */
export class Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;

  /**
   * cache of the original configurations provided to the logger instance
   */
  #config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.#config = config;

    this.debug = makeLogFn(config, "debug");
    this.info = makeLogFn(config, "info");
    this.warn = makeLogFn(config, "warn");
    this.error = makeLogFn(config, "error");
  }

  /**
   * allows overriding the context applied within the logger during runtime,
   * useful to add eventual context e.g. in durable objects.
   */
  setContext(context: Record<string, string>) {
    const nextConfig = { ...this.#config, context };

    this.debug = makeLogFn(nextConfig, "debug");
    this.info = makeLogFn(nextConfig, "info");
    this.warn = makeLogFn(nextConfig, "warn");
    this.error = makeLogFn(nextConfig, "error");
  }
}

function makeLogFn(config: LoggerConfig, level: LogLevel): LogFn {
  if (weightLogLevel(level) < weightLogLevel(config.level)) {
    return () => {
      // noop, this level has been disabled
    };
  }

  const levelPrefix = `[${config.level.toUpperCase()}]`;
  const prefix = config.prefix ? `${levelPrefix} ${config.prefix}` : levelPrefix;

  if (config.context) {
    const context = { context: config.context };

    return (callerName, message, ...additionalData) => {
      config.hook?.(level, `${callerName} ${message}`);

      // eslint-disable-next-line no-console
      console[config.level](`${prefix} ${callerName}: ${message}`, ...additionalData, context);
    };
  } else {
    // intentional code duplication, to micro-optimize performance by removing
    // conditional to check for existence of config.context only when creating a
    // logger - not on every log statement
    return (callerName, message, ...additionalData) => {
      config.hook?.(level, `${callerName} ${message}`);

      // eslint-disable-next-line no-console
      console[config.level](`${prefix} ${callerName}: ${message}`, ...additionalData);
    };
  }
}

function weightLogLevel(level: LogLevel): number {
  switch (level) {
    case "debug":
      return 0;
    case "info":
      return 1;
    case "warn":
      return 2;
    case "error":
      return 3;

    default:
      throw new Error(`weightLogLevel(): provided log level not recognized '${level}'`);
  }
}
