export type EngagementContractStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export type ProposalData = {
  client_summary?: {
    client_name: string;
    matter_summary: string;
    location_summary: string;
    goals_summary: string;
  };
  representation?: {
    scope_summary: string;
    included_services: string[];
    excluded_services: string[];
    client_identity_notes: string;
    jurisdiction_notes: string;
  };
  fees?: {
    billing_type: string;
    fixed_fee_amount: number | null;
    hourly_rate_attorney: number | null;
    hourly_rate_admin: number | null;
    contingency_percentage: number | null;
    retainer_amount: number | null;
    payment_frequency: string | null;
    fee_notes: string;
  };
  risk_review?: {
    conflict_status: 'unknown' | 'clear' | 'review_required' | 'conflicted';
    jurisdiction_status: 'unknown' | 'supported' | 'unsupported' | 'review_required';
    risk_notes: string[];
    open_questions: string[];
  };
  source_snapshot?: {
    intake_uuid: string;
    conversation_id: string;
    matter_id: string;
    practice_area: string;
    urgency: string;
    desired_outcome: string;
    opposing_party: string;
    court_date: string | null;
  };
  draft_meta?: {
    generated_at: string;
    generated_by: 'staff' | 'ai';
    version: number;
  };
};
