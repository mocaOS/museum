// import types from ./directus.d.ts and ./opensea.d.ts files, and export them as a single module
import type * as Directus from './directus';
import type * as OpenSea from './opensea';
import type * as GoogleSheets from './google-sheets';

declare global {
  namespace Types {
    export { Directus, OpenSea, GoogleSheets };
  }
}

export { Directus, OpenSea, GoogleSheets };
