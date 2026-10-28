/**
 * Comprehensive Dynamic Validation Rules Engine for Asset Templates.
 * Supports:
 * - Cross-field comparisons (dates, numbers, strings)
 * - Number ranges (min / max)
 * - Real-time relative date constraints (only past, only future, max days in past/future)
 * - Text patterns & Regex (RFC, Email, Phone, Custom regex)
 * - Conditional required rules (requiredIf another field has a specific value)
 */

export type ComparisonOperator = 
  | 'gt'      // > (greater than / posterior a)
  | 'gte'     // >= (greater than or equal / posterior o igual a)
  | 'lt'      // < (less than / anterior a)
  | 'lte'     // <= (less than or equal / anterior o igual a)
  | 'eq'      // == (igual a)
  | 'neq'     // != (distinto de)

export type DateConstraintType = 
  | 'pastOnly'         // Must be in the past or today
  | 'futureOnly'       // Must be in the future or today
  | 'strictlyPast'     // Must be before today
  | 'strictlyFuture'   // Must be after today
  | 'maxDaysInPast'    // No older than N days
  | 'maxDaysInFuture'  // No further than N days

export type PatternPreset =
  | 'custom'
  | 'email'
  | 'phone'
  | 'alphanumeric'
  | 'rfc_mx'
  | 'vin'

export interface FieldValidationRule {
  id: string
  type: 'compareField' | 'range' | 'dateConstraint' | 'pattern' | 'requiredIf'
  
  // 1. compareField
  operator?: ComparisonOperator
  targetField?: string
  
  // 2. range
  min?: number
  max?: number

  // 3. dateConstraint
  dateConstraint?: DateConstraintType
  dateDays?: number

  // 4. pattern
  patternPreset?: PatternPreset
  customRegex?: string

  // 5. requiredIf
  requiredIfField?: string
  requiredIfOperator?: 'eq' | 'neq' | 'notEmpty'
  requiredIfValue?: string

  customMessage?: string
}

export const PRESET_PATTERNS: Record<PatternPreset, { regex: RegExp; label: string; defaultMsg: string }> = {
  custom: {
    regex: /.*/,
    label: 'Expresión regular personalizada',
    defaultMsg: 'El formato no es válido.',
  },
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    label: 'Correo Electrónico',
    defaultMsg: 'Debe ser un correo electrónico válido.',
  },
  phone: {
    regex: /^\+?[0-9\s\-()]{7,20}$/,
    label: 'Número de Teléfono',
    defaultMsg: 'Debe ser un teléfono válido (7 a 20 dígitos).',
  },
  alphanumeric: {
    regex: /^[a-zA-Z0-9_-]+$/,
    label: 'Alfanumérico (letras, números, - y _)',
    defaultMsg: 'Solo se permiten caracteres alfanuméricos, guiones y guiones bajos.',
  },
  rfc_mx: {
    regex: /^[A-ZÑ&]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i,
    label: 'RFC (México - 12 o 13 caracteres)',
    defaultMsg: 'Debe tener una estructura de RFC válida.',
  },
  vin: {
    regex: /^[A-HJ-NPR-Z0-9]{17}$/i,
    label: 'Número de Serie / VIN (17 caracteres)',
    defaultMsg: 'Debe contener exactamente 17 caracteres alfanuméricos válidos.',
  },
}

/**
 * Validates form properties against configured validation rules in the schema.
 */
export function validateDynamicRules(
  properties: Record<string, any>,
  schemaProperties: Record<string, any>,
  errors: any,
  t?: (key: string, options?: any) => string
): void {
  if (!properties || !schemaProperties) return

  for (const [key, propConfig] of Object.entries(schemaProperties)) {
    const rules: FieldValidationRule[] = (propConfig as any)?._validationRules || (propConfig as any)?.validationRules
    if (!rules || !Array.isArray(rules) || rules.length === 0) continue

    const val = properties[key]
    const hasValue = val !== undefined && val !== null && val !== ''

    for (const rule of rules) {
      // 1. Required If (Evaluates even if current field has no value)
      if (rule.type === 'requiredIf' && rule.requiredIfField) {
        const condVal = properties[rule.requiredIfField]
        const condHasValue = condVal !== undefined && condVal !== null && condVal !== ''
        let conditionMet = false

        if (rule.requiredIfOperator === 'notEmpty') {
          conditionMet = condHasValue
        } else if (rule.requiredIfOperator === 'neq') {
          conditionMet = String(condVal ?? '') !== String(rule.requiredIfValue ?? '')
        } else {
          // Default: eq
          conditionMet = String(condVal ?? '').toLowerCase() === String(rule.requiredIfValue ?? '').toLowerCase()
        }

        if (conditionMet && !hasValue) {
          const targetTitle = schemaProperties[rule.requiredIfField]?.title || rule.requiredIfField
          const msg = rule.customMessage || 
            `Este campo es obligatorio cuando "${targetTitle}" cumple la condición especificada.`
          addFieldError(errors, key, msg)
        }
      }

      // If field is empty, further format/range/comparison checks are skipped
      if (!hasValue) continue

      // 2. Numeric Range
      if (rule.type === 'range') {
        const num = typeof val === 'number' ? val : parseFloat(val)
        if (!isNaN(num)) {
          if (rule.min !== undefined && rule.min !== null && num < rule.min) {
            const msg = rule.customMessage || 
              (t ? t('validation.minExceeded', { min: rule.min }) : `El valor no puede ser menor a ${rule.min}`)
            addFieldError(errors, key, msg)
          }
          if (rule.max !== undefined && rule.max !== null && num > rule.max) {
            const msg = rule.customMessage || 
              (t ? t('validation.maxExceeded', { max: rule.max }) : `El valor no puede ser mayor a ${rule.max}`)
            addFieldError(errors, key, msg)
          }
        }
      }

      // 3. Cross-field Comparison
      else if (rule.type === 'compareField' && rule.targetField && rule.operator) {
        const targetVal = properties[rule.targetField]
        if (targetVal === undefined || targetVal === null || targetVal === '') continue

        const targetTitle = schemaProperties[rule.targetField]?.title || rule.targetField
        const isDate = isDateValue(val) && isDateValue(targetVal)
        const isNum = !isDate && !isNaN(parseFloat(val)) && !isNaN(parseFloat(targetVal))

        let satisfies = true
        if (isDate) {
          const d1 = new Date(val).getTime()
          const d2 = new Date(targetVal).getTime()
          satisfies = compareValues(d1, d2, rule.operator)
        } else if (isNum) {
          const n1 = parseFloat(val)
          const n2 = parseFloat(targetVal)
          satisfies = compareValues(n1, n2, rule.operator)
        } else {
          satisfies = compareValues(String(val), String(targetVal), rule.operator)
        }

        if (!satisfies) {
          const msg = rule.customMessage || getDefaultComparisonMessage(rule.operator, targetTitle, isDate)
          addFieldError(errors, key, msg)
        }
      }

      // 4. Date Constraints against Today
      else if (rule.type === 'dateConstraint' && rule.dateConstraint && isDateValue(val)) {
        const targetDate = new Date(val)
        const now = new Date()
        // Compare by date only (strip time)
        const dTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
        const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const diffDays = Math.round((dTarget - dNow) / (1000 * 60 * 60 * 24))

        let valid = true
        let defaultMsg = ''

        switch (rule.dateConstraint) {
          case 'pastOnly':
            valid = dTarget <= dNow
            defaultMsg = 'La fecha no puede ser futura.'
            break
          case 'futureOnly':
            valid = dTarget >= dNow
            defaultMsg = 'La fecha no puede ser pasada.'
            break
          case 'strictlyPast':
            valid = dTarget < dNow
            defaultMsg = 'La fecha debe ser estrictamente anterior a hoy.'
            break
          case 'strictlyFuture':
            valid = dTarget > dNow
            defaultMsg = 'La fecha debe ser estrictamente posterior a hoy.'
            break
          case 'maxDaysInPast':
            if (rule.dateDays !== undefined && rule.dateDays > 0) {
              valid = diffDays >= -rule.dateDays && diffDays <= 0
              defaultMsg = `La fecha no puede tener más de ${rule.dateDays} días en el pasado.`
            }
            break
          case 'maxDaysInFuture':
            if (rule.dateDays !== undefined && rule.dateDays > 0) {
              valid = diffDays <= rule.dateDays && diffDays >= 0
              defaultMsg = `La fecha no puede tener más de ${rule.dateDays} días en el futuro.`
            }
            break
        }

        if (!valid) {
          addFieldError(errors, key, rule.customMessage || defaultMsg)
        }
      }

      // 5. Pattern & Regex
      else if (rule.type === 'pattern' && typeof val === 'string') {
        let patternRegex: RegExp | null = null
        let defaultMsg = 'El formato no cumple con el patrón requerido.'

        if (rule.patternPreset && rule.patternPreset !== 'custom') {
          const preset = PRESET_PATTERNS[rule.patternPreset]
          if (preset) {
            patternRegex = preset.regex
            defaultMsg = preset.defaultMsg
          }
        } else if (rule.customRegex) {
          try {
            patternRegex = new RegExp(rule.customRegex)
          } catch {
            patternRegex = null
          }
        }

        if (patternRegex && !patternRegex.test(val)) {
          addFieldError(errors, key, rule.customMessage || defaultMsg)
        }
      }
    }
  }
}

function compareValues(a: number | string, b: number | string, op: ComparisonOperator): boolean {
  switch (op) {
    case 'gt': return a > b
    case 'gte': return a >= b
    case 'lt': return a < b
    case 'lte': return a <= b
    case 'eq': return a === b
    case 'neq': return a !== b
    default: return true
  }
}

function isDateValue(val: any): boolean {
  if (typeof val !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val))
}

function getDefaultComparisonMessage(op: ComparisonOperator, targetTitle: string, isDate: boolean): string {
  if (isDate) {
    switch (op) {
      case 'gt': return `Debe ser posterior a "${targetTitle}"`
      case 'gte': return `Debe ser posterior o igual a "${targetTitle}"`
      case 'lt': return `Debe ser anterior a "${targetTitle}"`
      case 'lte': return `Debe ser anterior o igual a "${targetTitle}"`
      case 'eq': return `Debe ser igual a "${targetTitle}"`
      case 'neq': return `Debe ser distinta a "${targetTitle}"`
    }
  }
  switch (op) {
    case 'gt': return `Debe ser mayor que "${targetTitle}"`
    case 'gte': return `Debe ser mayor o igual que "${targetTitle}"`
    case 'lt': return `Debe ser menor que "${targetTitle}"`
    case 'lte': return `Debe ser menor o igual que "${targetTitle}"`
    case 'eq': return `Debe ser igual a "${targetTitle}"`
    case 'neq': return `Debe ser distinto de "${targetTitle}"`
  }
}

function addFieldError(errors: any, fieldKey: string, message: string) {
  if (!errors) return
  if (errors[fieldKey] && typeof errors[fieldKey].addError === 'function') {
    errors[fieldKey].addError(message)
  } else if (typeof errors.addError === 'function') {
    errors.addError(message)
  }
}

export interface ValidationErrorItem {
  fieldKey: string
  fieldTitle: string
  message: string
}

/**
 * Imperatively evaluates validation rules and returns a list of error messages.
 * Used before form submissions to guarantee that invalid dynamic data is blocked,
 * even when the dynamic fields form is not natively submitting itself.
 */
export function getDynamicValidationErrors(
  properties: Record<string, any>,
  schemaProperties: Record<string, any>,
  t?: (key: string, options?: any) => string
): ValidationErrorItem[] {
  const result: ValidationErrorItem[] = []
  if (!properties || !schemaProperties) return result

  // Create proxy-like error collector per field
  const fieldErrorsCollector: Record<string, any> = {}
  for (const [key, propConfig] of Object.entries(schemaProperties)) {
    const title = (propConfig as any)?.title || key
    fieldErrorsCollector[key] = {
      addError: (msg: string) => {
        result.push({ fieldKey: key, fieldTitle: title, message: msg })
      }
    }
  }

  validateDynamicRules(properties, schemaProperties, fieldErrorsCollector, t)

  return result
}
