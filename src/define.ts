import type { Config, ConfigFactory, ConfigModule } from "./types.ts";

/**
 * Identity at runtime; its job is to type the config. Accepts the object or the function form,
 * and gives back the same thing, so the default export keeps the shape the scanner expects.
 *
 *   export default defineConfig(({ args }) => ({ pages: ["/"] }));
 */
export function defineConfig(config: Config): Config;
export function defineConfig(factory: ConfigFactory): ConfigFactory;
export function defineConfig(config: ConfigModule): ConfigModule {
  return config;
}
