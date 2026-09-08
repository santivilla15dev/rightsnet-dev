/** Labels + demo orgs for Rights Operations UI (no invented API metrics). */
export const DEMO_ORGANIZATIONS = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    legal_name: 'Estudio Norte · Sandbox',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    legal_name: 'Otra empresa · Sandbox',
  },
] as const;

export const OVERVIEW_METRIC_ROWS = [
  { key: 'active_talent_agreements', label: 'Acuerdos de talento activos' },
  { key: 'expiring_in_30_days', label: 'Caducan en 30 días' },
  { key: 'ai_rights_enabled', label: 'Derechos AI habilitados' },
  { key: 'ai_use_prohibited', label: 'Uso AI prohibido' },
  { key: 'approval_required', label: 'Requieren aprobación' },
  { key: 'conflicting_exclusivity', label: 'Exclusividad en conflicto' },
  { key: 'missing_structured_rights', label: 'Derechos estructurados pendientes' },
] as const;

export type OverviewMetricKey = (typeof OVERVIEW_METRIC_ROWS)[number]['key'];

export const CAMPAIGN_BUCKET_ROWS = [
  { key: 'fully_cleared', label: 'Totalmente liberados' },
  { key: 'approval_required', label: 'Requieren aprobación' },
  { key: 'not_permitted', label: 'No permitidos' },
  { key: 'agreement_unclear', label: 'Acuerdo poco claro' },
] as const;

export type CampaignBucketKey = (typeof CAMPAIGN_BUCKET_ROWS)[number]['key'];

export type RightsOverviewResponse = {
  organization_id: string;
  surface: 'rights_operations';
  metrics: Record<OverviewMetricKey, number>;
};

export type CampaignQueryResponse = {
  organization_id: string;
  surface: 'rights_operations';
  relationships: number;
  fully_cleared: number;
  approval_required: number;
  not_permitted: number;
  agreement_unclear: number;
  items: Record<CampaignBucketKey, string[]>;
};
