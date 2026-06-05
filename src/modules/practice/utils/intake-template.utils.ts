import type { IntakeTemplateField } from '@/modules/practice/database/schema/intake-templates.schema';

export const mapIntakeTemplateFieldToPublicSettings = (f: IntakeTemplateField) => ({
  id: f.id,
  key: f.key,
  label: f.label,
  field_type: f.field_type,
  phase: f.phase,
  required: f.required,
  order_index: f.order_index,
  placeholder: f.placeholder ?? null,
  help_text: f.help_text ?? null,
  prompt_hint: f.prompt_hint ?? null,
  is_standard: f.is_standard,
  options: f.options ?? null,
});
