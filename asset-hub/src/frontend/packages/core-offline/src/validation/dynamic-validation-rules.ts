/**
 * Dynamic Validation Rules Engine for Asset & Workflow Templates (offline-capable).
 * Parity with apps/web/src/lib/dynamic-validation-rules.ts.
 */

export type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type DateConstraintType =
  | 'pastOnly'
  | 'futureOnly'
  | 'strictlyPast'
  | 'strictlyFuture'
  | 'maxDaysInPast'
  | 'maxDaysInFuture';

export type PatternPreset =
  | 'custom'
  | 'email'
  | 'phone'
  | 'alphanumeric'
  | 'rfc_mx'
  | 'vin';

export interface FieldValidationRule {
  id: string;
  type: 'compareField' | 'range' | 'dateConstraint' | 'pattern' | 'requiredIf';
  operator?: ComparisonOperator;
  targetField?: string;
  min?: number;
  max?: number;
  dateConstraint?: DateConstraintType;
  dateDays?: number;
  patternPreset?: PatternPreset;
  customRegex?: string;
  requiredIfField?: string;
  requiredIfOperator?: 'eq' | 'neq' | 'notEmpty';
  requiredIfValue?: string;
  customMessage?: string;
}

export const PRESET_PATTERNS: Record<
  PatternPreset,
  { regex: RegExp; label: string; defaultMsg: string }
> = {
  custom: {
    regex: /.*/,
    label: 'Custom regex',
    defaultMsg: 'Invalid format.',
  },
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    label: 'Email',
    defaultMsg: 'Must be a valid email address.',
  },
  phone: {
    regex: /^\+?[0-9\s\-()]{7,20}$/,
    label: 'Phone',
    defaultMsg: 'Must be a valid phone number (7 to 20 digits).',
  },
  alphanumeric: {
    regex: /^[a-zA-Z0-9_-]+$/,
    label: 'Alphanumeric',
    defaultMsg: 'Only alphanumeric characters, hyphens, and underscores are allowed.',
  },
  rfc_mx: {
    regex: /^[A-ZÑ&]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i,
    label: 'RFC (Mexico)',
    defaultMsg: 'Must be a valid RFC.',
  },
  vin: {
    regex: /^[A-HJ-NPR-Z0-9]{17}$/i,
    label: 'VIN (17 characters)',
    defaultMsg: 'Must contain 17 valid alphanumeric characters.',
  },
};

export interface ValidationErrorItem {
  fieldKey: string;
  fieldTitle: string;
  message: string;
}

export function validateDynamicRules(
  properties: Record<string, any>,
  schemaProperties: Record<string, any>,
  errors: any,
  t?: (key: string, options?: any) => string
): void {
  if (!properties || !schemaProperties) return;

  for (const [key, propConfig] of Object.entries(schemaProperties)) {
    const rules: FieldValidationRule[] =
      (propConfig as any)?._validationRules || (propConfig as any)?.validationRules;
    if (!rules || !Array.isArray(rules) || rules.length === 0) continue;

    const val = properties[key];
    const hasValue = val !== undefined && val !== null && val !== '';

    for (const rule of rules) {
      if (rule.type === 'requiredIf' && rule.requiredIfField) {
        const condVal = properties[rule.requiredIfField];
        const condHasValue = condVal !== undefined && condVal !== null && condVal !== '';
        let conditionMet = false;

        if (rule.requiredIfOperator === 'notEmpty') {
          conditionMet = condHasValue;
        } else if (rule.requiredIfOperator === 'neq') {
          conditionMet = String(condVal ?? '') !== String(rule.requiredIfValue ?? '');
        } else {
          conditionMet =
            String(condVal ?? '').toLowerCase() ===
            String(rule.requiredIfValue ?? '').toLowerCase();
        }

        if (conditionMet && !hasValue) {
          const targetTitle =
            schemaProperties[rule.requiredIfField]?.title || rule.requiredIfField;
          const msg =
            rule.customMessage ||
            `Field is required when "${targetTitle}" matches the condition.`;
          addFieldError(errors, key, msg);
        }
      }

      if (!hasValue) continue;

      if (rule.type === 'range') {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (!isNaN(num)) {
          if (rule.min !== undefined && rule.min !== null && num < rule.min) {
            const msg =
              rule.customMessage ||
              (t
                ? t('validation.minExceeded', { min: rule.min })
                : `Value cannot be less than ${rule.min}`);
            addFieldError(errors, key, msg);
          }
          if (rule.max !== undefined && rule.max !== null && num > rule.max) {
            const msg =
              rule.customMessage ||
              (t
                ? t('validation.maxExceeded', { max: rule.max })
                : `Value cannot be greater than ${rule.max}`);
            addFieldError(errors, key, msg);
          }
        }
      } else if (rule.type === 'compareField' && rule.targetField && rule.operator) {
        const targetVal = properties[rule.targetField];
        if (targetVal === undefined || targetVal === null || targetVal === '') continue;

        const targetTitle =
          schemaProperties[rule.targetField]?.title || rule.targetField;
        const isDate = isDateValue(val) && isDateValue(targetVal);
        const isNum =
          !isDate && !isNaN(parseFloat(val)) && !isNaN(parseFloat(targetVal));

        let satisfies = true;
        if (isDate) {
          satisfies = compareValues(
            new Date(val).getTime(),
            new Date(targetVal).getTime(),
            rule.operator
          );
        } else if (isNum) {
          satisfies = compareValues(
            parseFloat(val),
            parseFloat(targetVal),
            rule.operator
          );
        } else {
          satisfies = compareValues(String(val), String(targetVal), rule.operator);
        }

        if (!satisfies) {
          const msg =
            rule.customMessage ||
            `Must satisfy ${rule.operator} against "${targetTitle}"`;
          addFieldError(errors, key, msg);
        }
      } else if (
        rule.type === 'dateConstraint' &&
        rule.dateConstraint &&
        isDateValue(val)
      ) {
        const targetDate = new Date(val);
        const now = new Date();
        const dTarget = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate()
        ).getTime();
        const dNow = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).getTime();
        const diffDays = Math.round((dTarget - dNow) / (1000 * 60 * 60 * 24));

        let valid = true;
        let defaultMsg = 'Invalid date constraint.';

        switch (rule.dateConstraint) {
          case 'pastOnly':
            valid = dTarget <= dNow;
            defaultMsg = 'Date cannot be in the future.';
            break;
          case 'futureOnly':
            valid = dTarget >= dNow;
            defaultMsg = 'Date cannot be in the past.';
            break;
          case 'strictlyPast':
            valid = dTarget < dNow;
            defaultMsg = 'Date must be strictly before today.';
            break;
          case 'strictlyFuture':
            valid = dTarget > dNow;
            defaultMsg = 'Date must be strictly after today.';
            break;
          case 'maxDaysInPast':
            if (rule.dateDays !== undefined && rule.dateDays > 0) {
              valid = diffDays >= -rule.dateDays && diffDays <= 0;
              defaultMsg = `Date cannot be more than ${rule.dateDays} days in the past.`;
            }
            break;
          case 'maxDaysInFuture':
            if (rule.dateDays !== undefined && rule.dateDays > 0) {
              valid = diffDays <= rule.dateDays && diffDays >= 0;
              defaultMsg = `Date cannot be more than ${rule.dateDays} days in the future.`;
            }
            break;
        }

        if (!valid) {
          addFieldError(errors, key, rule.customMessage || defaultMsg);
        }
      } else if (rule.type === 'pattern' && typeof val === 'string') {
        let patternRegex: RegExp | null = null;
        let defaultMsg = 'Value does not match required pattern.';

        if (rule.patternPreset && rule.patternPreset !== 'custom') {
          const preset = PRESET_PATTERNS[rule.patternPreset];
          if (preset) {
            patternRegex = preset.regex;
            defaultMsg = preset.defaultMsg;
          }
        } else if (rule.customRegex) {
          try {
            patternRegex = new RegExp(rule.customRegex);
          } catch {
            patternRegex = null;
          }
        }

        if (patternRegex && !patternRegex.test(val)) {
          addFieldError(errors, key, rule.customMessage || defaultMsg);
        }
      }
    }
  }
}

export function getDynamicValidationErrors(
  properties: Record<string, any>,
  schemaProperties: Record<string, any>,
  t?: (key: string, options?: any) => string
): ValidationErrorItem[] {
  const result: ValidationErrorItem[] = [];
  if (!properties || !schemaProperties) return result;

  const fieldErrorsCollector: Record<string, any> = {};
  for (const [key, propConfig] of Object.entries(schemaProperties)) {
    const title = (propConfig as any)?.title || key;
    fieldErrorsCollector[key] = {
      addError: (msg: string) => {
        result.push({ fieldKey: key, fieldTitle: title, message: msg });
      },
    };
  }

  validateDynamicRules(properties, schemaProperties, fieldErrorsCollector, t);
  return result;
}

function compareValues(
  a: number | string,
  b: number | string,
  op: ComparisonOperator
): boolean {
  switch (op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'neq':
      return a !== b;
    default:
      return true;
  }
}

function isDateValue(val: any): boolean {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val));
}

function addFieldError(errors: any, fieldKey: string, message: string) {
  if (!errors) return;
  if (errors[fieldKey] && typeof errors[fieldKey].addError === 'function') {
    errors[fieldKey].addError(message);
  } else if (typeof errors.addError === 'function') {
    errors.addError(message);
  }
}

