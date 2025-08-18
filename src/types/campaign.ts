/**
 * Tipos para o sistema de campanhas e formulários customizáveis
 */

export type CampaignStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Campaign {
  id: string;
  doctor_id: string;
  campaign_slug: string;
  title: string;
  description?: string;
  benefit_title?: string;
  benefit_description?: string;
  hero_image_url?: string;
  form_config?: FormConfig;
  status: CampaignStatus;
  valid_from?: Date;
  valid_until?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Configuração do formulário customizável
 */
export interface FormConfig {
  fields: FormField[];
  consent?: ConsentConfig;
  ui?: UIConfig;
}

export type FieldType = 
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  options?: SelectOption[];
  validation?: ValidationRule;
  visibility_rules?: VisibilityRule[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ValidationRule {
  pattern?: string;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  error_message?: string;
}

export interface VisibilityRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  value: string;
}

export interface ConsentConfig {
  show_checkbox: boolean;
  label: string;
  required: boolean;
  privacy_policy_url?: string;
}

export interface UIConfig {
  layout: 'single_column' | 'two_columns';
  cta_text: string;
  success_message?: string;
  redirect_url?: string;
  theme?: 'light' | 'dark' | 'custom';
  custom_css?: string;
}

/**
 * Dados enviados pelo formulário
 */
export interface FormSubmission {
  email: string;
  custom_fields?: Record<string, any>;
  consent?: {
    accepted: boolean;
    version?: string;
  };
  meta?: {
    campaign_id?: string;
    doctor_id?: string;
    referral_code?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    referrer?: string;
    ip_address?: string;
  };
}

/**
 * Eventos de campanha para analytics
 */
export type CampaignEventType = 
  | 'PAGE_VIEW'
  | 'FORM_SUBMIT'
  | 'FORM_SUCCESS'
  | 'FORM_ERROR'
  | 'CTA_CLICK';

export interface CampaignEvent {
  id: string;
  campaign_id: string;
  event_type: CampaignEventType;
  user_id?: string;
  ip_address?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}
