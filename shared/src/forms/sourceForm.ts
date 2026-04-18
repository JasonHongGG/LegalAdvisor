import type { FieldErrorDto, SourceFormFieldDto, SourceFormFieldValue } from '../contracts/api/v1.js';

export function getSourceFormFieldDefaultValue(field: SourceFormFieldDto): SourceFormFieldValue {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  if (field.type === 'checkbox') {
    return false;
  }

  return '';
}

export function normalizeSourceFormFieldValue(
  field: SourceFormFieldDto,
  rawValue: SourceFormFieldValue | undefined,
): SourceFormFieldValue {
  if (field.type === 'checkbox') {
    return Boolean(rawValue);
  }

  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (field.type === 'number') {
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? rawValue : null;
    }

    const stringValue = String(rawValue).trim();
    if (!stringValue) {
      return null;
    }

    const numericValue = Number(stringValue);
    return Number.isFinite(numericValue) ? numericValue : Number.NaN;
  }

  const stringValue = String(rawValue).trim();
  return stringValue ? stringValue : null;
}

export function validateSourceFormValues(
  fields: SourceFormFieldDto[],
  values: Record<string, SourceFormFieldValue | undefined>,
): {
  normalizedValues: Record<string, SourceFormFieldValue>;
  fieldErrors: FieldErrorDto[];
} {
  const normalizedValues: Record<string, SourceFormFieldValue> = {};
  const fieldErrors: FieldErrorDto[] = [];

  for (const field of fields) {
    const normalizedValue = normalizeSourceFormFieldValue(field, values[field.name]);
    normalizedValues[field.name] = normalizedValue;

    if (field.required) {
      const isEmpty = normalizedValue === null || normalizedValue === '';
      if (isEmpty) {
        fieldErrors.push({ field: field.name, message: `${field.label} 為必填欄位` });
        continue;
      }
    }

    if (normalizedValue === null || normalizedValue === '') {
      continue;
    }

    if (field.type === 'number') {
      if (typeof normalizedValue !== 'number' || Number.isNaN(normalizedValue)) {
        fieldErrors.push({ field: field.name, message: `${field.label} 必須是數字` });
        continue;
      }

      if (field.validation?.integer && !Number.isInteger(normalizedValue)) {
        fieldErrors.push({ field: field.name, message: `${field.label} 必須是整數` });
      }

      if (field.validation?.min !== undefined && normalizedValue < field.validation.min) {
        fieldErrors.push({ field: field.name, message: `${field.label} 不能小於 ${field.validation.min}` });
      }

      if (field.validation?.max !== undefined && normalizedValue > field.validation.max) {
        fieldErrors.push({ field: field.name, message: `${field.label} 不能大於 ${field.validation.max}` });
      }

      continue;
    }

    if (typeof normalizedValue !== 'string') {
      continue;
    }

    if (field.validation?.minLength !== undefined && normalizedValue.length < field.validation.minLength) {
      fieldErrors.push({ field: field.name, message: `${field.label} 至少需要 ${field.validation.minLength} 個字元` });
    }

    if (field.validation?.maxLength !== undefined && normalizedValue.length > field.validation.maxLength) {
      fieldErrors.push({ field: field.name, message: `${field.label} 不能超過 ${field.validation.maxLength} 個字元` });
    }

    if (field.type === 'url' || field.validation?.url) {
      try {
        new URL(normalizedValue);
      } catch {
        fieldErrors.push({ field: field.name, message: `${field.label} 不是合法網址` });
      }
    }
  }

  return { normalizedValues, fieldErrors };
}
