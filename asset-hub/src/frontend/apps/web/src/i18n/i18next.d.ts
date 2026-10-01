import "i18next";
import type { resources } from "./index";

/**
 * Type-safe keys: t('hero.title1') is checked against the actual JSON
 * dictionaries, and object/array keys resolve with { returnObjects: true }.
 *
 * NOTE: type-level `resources` is keyed by NAMESPACE (not by language), so we
 * take the shape of one locale. Both locales are kept in parity (es is the
 * default/fallback), so keys are identical.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    resources: (typeof resources)["es"];
    returnObjects: true;
    returnNull: false;
  }
}
