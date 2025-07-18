import _ from "lodash";
import development from "./config.development";
import production from "./config.production";
import staging from "./config.staging";

const config = (() => {
  let tempConfig = _.merge(development);

  if (process.env.APP_ENV === "production") {
    tempConfig = _.merge(tempConfig, production);
  }

  if (process.env.APP_ENV === "staging") {
    tempConfig = _.merge(tempConfig, staging);
  }

  return tempConfig;
})();

export default config as typeof development & typeof production & typeof staging;
