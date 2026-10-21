import {
  PARENT_GENDERS,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_FIELDS,
  PROFESSIONAL_AREA_LABELS,
  PROFESSIONAL_FIELD_LABELS,
  professionalProfileSchema,
  type ParentGender,
  type ProfessionalArea,
  type ProfessionalField,
  type ProfessionalProfileInput,
} from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { SelectInput } from '@/components/ui/select-input';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import {
  ABOUT_LABEL,
  AREA_LABEL,
  AREA_PLACEHOLDER,
  BUSINESS_NAME_LABEL,
  FIELD_LABEL,
  FIELD_OTHER_LABEL,
  FIELD_PLACEHOLDER,
  FORM_ERRORS,
  FULL_NAME_LABEL,
  GENDER_LABEL,
  GENDER_LABELS,
  GENDER_PLACEHOLDER,
  PRICE_LABEL,
  YEARS_LABEL,
} from '@/lib/professional-texts';

/** The form's text state: every field as typed, so an invalid value stays on screen until it is fixed. */
export interface ProfessionalForm {
  fullName: string;
  businessName: string;
  gender: string;
  field: string;
  fieldOther: string;
  yearsExperience: string;
  area: string;
  about: string;
  priceFrom: string;
}

export const EMPTY_PROFESSIONAL_FORM: ProfessionalForm = {
  fullName: '',
  businessName: '',
  gender: '',
  field: '',
  fieldOther: '',
  yearsExperience: '',
  area: '',
  about: '',
  priceFrom: '',
};

const isField = (value: string): value is ProfessionalField => PROFESSIONAL_FIELDS.some((field) => field === value);
const isArea = (value: string): value is ProfessionalArea => PROFESSIONAL_AREAS.some((area) => area === value);
const isGender = (value: string): value is ParentGender => PARENT_GENDERS.some((gender) => gender === value);
const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value);
const numberOrNaN = (value: string): number => (/^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

/** The body the server takes, from the form's text (the same schema checks it on both sides). */
export function professionalInputOf(form: ProfessionalForm): ProfessionalProfileInput {
  const field: ProfessionalField = isField(form.field) ? form.field : 'other';
  return {
    fullName: form.fullName,
    businessName: blankToNull(form.businessName),
    gender: isGender(form.gender) ? form.gender : null,
    field,
    fieldOther: field === 'other' ? blankToNull(form.fieldOther) : null,
    yearsExperience: numberOrNaN(form.yearsExperience),
    area: isArea(form.area) ? form.area : null,
    about: blankToNull(form.about),
    priceFrom: form.priceFrom.trim() === '' ? null : numberOrNaN(form.priceFrom),
  };
}

const isFormKey = (key: string): key is keyof ProfessionalForm => Object.keys(EMPTY_PROFESSIONAL_FORM).includes(key);

export type ProfessionalFormErrors = Partial<Record<keyof ProfessionalForm, string>>;

/** The form's errors by field (empty when valid). An unchosen field is "field_required", whatever the schema saw. */
export function professionalFormErrors(form: ProfessionalForm): ProfessionalFormErrors {
  const errors: ProfessionalFormErrors = {};
  if (!isField(form.field)) errors.field = FORM_ERRORS.field_required ?? '';
  const result = professionalProfileSchema.safeParse(professionalInputOf(form));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && isFormKey(key) && errors[key] === undefined) {
        errors[key] = FORM_ERRORS[issue.message] ?? FORM_ERRORS.field_required ?? '';
      }
    }
  }
  return errors;
}

/** The form's text from a saved profile. */
export function professionalFormOf(profile: {
  fullName: string;
  businessName: string | null;
  gender: ParentGender | null;
  field: ProfessionalField;
  fieldOther: string | null;
  yearsExperience: number;
  area: ProfessionalArea | null;
  about: string | null;
  priceFrom: number | null;
}): ProfessionalForm {
  return {
    fullName: profile.fullName,
    businessName: profile.businessName ?? '',
    gender: profile.gender ?? '',
    field: profile.field,
    fieldOther: profile.fieldOther ?? '',
    yearsExperience: String(profile.yearsExperience),
    area: profile.area ?? '',
    about: profile.about ?? '',
    priceFrom: profile.priceFrom === null ? '' : String(profile.priceFrom),
  };
}

const FIELD_OPTIONS = PROFESSIONAL_FIELDS.map((value) => ({ value, label: PROFESSIONAL_FIELD_LABELS[value] }));
const AREA_OPTIONS = PROFESSIONAL_AREAS.map((value) => ({ value, label: PROFESSIONAL_AREA_LABELS[value] }));
const GENDER_OPTIONS = PARENT_GENDERS.map((value) => ({ value, label: GENDER_LABELS[value] }));

export interface ProfessionalProfileFieldsProps {
  form: ProfessionalForm;
  errors: ProfessionalFormErrors;
  onChange: (next: ProfessionalForm) => void;
}

// The fields of a Professional profile (FR-PROREG-001, FR-SERV-002/003): registration step 1 and the owner's edit. No business number and no
// verification field (FR-PROREG-003 cancelled). The area is a city or area from a list (§12): no location permission, no map.
export function ProfessionalProfileFields({ form, errors, onChange }: ProfessionalProfileFieldsProps) {
  const set = (key: keyof ProfessionalForm) => (value: string) => onChange({ ...form, [key]: value });
  const error = (key: keyof ProfessionalForm) => (errors[key] === undefined ? {} : { error: errors[key] });
  return (
    <div className="flex flex-col gap-5">
      <FormField label={FULL_NAME_LABEL} {...error('fullName')}>
        {(control) => <TextInput {...control} autoComplete="name" value={form.fullName} onChange={(event) => set('fullName')(event.target.value)} />}
      </FormField>
      <FormField label={BUSINESS_NAME_LABEL} optional {...error('businessName')}>
        {(control) => <TextInput {...control} autoComplete="organization" value={form.businessName} onChange={(event) => set('businessName')(event.target.value)} />}
      </FormField>
      <FormField label={GENDER_LABEL} optional>
        {(control) => <SelectInput {...control} options={GENDER_OPTIONS} placeholder={GENDER_PLACEHOLDER} value={form.gender} onChange={set('gender')} />}
      </FormField>
      <FormField label={FIELD_LABEL} {...error('field')}>
        {(control) => <SelectInput {...control} options={FIELD_OPTIONS} placeholder={FIELD_PLACEHOLDER} value={form.field} onChange={set('field')} />}
      </FormField>
      {form.field === 'other' ? (
        <FormField label={FIELD_OTHER_LABEL} {...error('fieldOther')}>
          {(control) => <TextInput {...control} value={form.fieldOther} onChange={(event) => set('fieldOther')(event.target.value)} />}
        </FormField>
      ) : null}
      <FormField label={YEARS_LABEL} {...error('yearsExperience')}>
        {(control) => (
          <TextInput {...control} dir="ltr" value={form.yearsExperience} onChange={(event) => set('yearsExperience')(event.target.value)} />
        )}
      </FormField>
      <FormField label={AREA_LABEL} optional {...error('area')}>
        {(control) => <SelectInput {...control} options={AREA_OPTIONS} placeholder={AREA_PLACEHOLDER} value={form.area} onChange={set('area')} />}
      </FormField>
      <FormField label={PRICE_LABEL} optional {...error('priceFrom')}>
        {(control) => <TextInput {...control} dir="ltr" value={form.priceFrom} onChange={(event) => set('priceFrom')(event.target.value)} />}
      </FormField>
      <FormField label={ABOUT_LABEL} optional {...error('about')}>
        {(control) => <TextArea {...control} rows={4} value={form.about} onChange={(event) => set('about')(event.target.value)} />}
      </FormField>
    </div>
  );
}
