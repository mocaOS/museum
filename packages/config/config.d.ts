import developmentConfig from './src/config.development';
import productionConfig from './src/config.production';
import stagingConfig from './src/config.staging';

declare module "config" {
  type Config = typeof developmentConfig & typeof productionConfig & typeof stagingConfig;
  const config: Config;

  export default config;
}
