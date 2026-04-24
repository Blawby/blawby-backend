import { BaseEvent } from '@/shared/events/event';

export class EngagementContractCreated extends BaseEvent<{
  contract_id: string;
  matter_id: string;
  organization_id: string;
}> {
  static type = 'engagement_contract.created' as const;
  type = EngagementContractCreated.type;
}

export class EngagementContractSent extends BaseEvent<{
  contract_id: string;
  matter_id: string;
  organization_id: string;
  client_email: string;
  client_name: string;
  matter_title: string;
  practice_name: string;
  review_url: string;
}> {
  static type = 'engagement_contract.sent' as const;
  type = EngagementContractSent.type;
}

export class EngagementContractAccepted extends BaseEvent<{
  contract_id: string;
  matter_id: string;
  organization_id: string;
  practice_email: string;
  practice_name: string;
  matter_title: string;
  client_name: string;
  client_email: string;
  signed_pdf_s3_key: string;
}> {
  static type = 'engagement_contract.accepted' as const;
  type = EngagementContractAccepted.type;
}

export class EngagementContractDeclined extends BaseEvent<{
  contract_id: string;
  matter_id: string;
  organization_id: string;
  practice_email: string;
  practice_name: string;
  matter_title: string;
  client_name: string;
}> {
  static type = 'engagement_contract.declined' as const;
  type = EngagementContractDeclined.type;
}

export class ConflictCheckCompleted extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  result_status: 'clear' | 'review_required' | 'conflicted' | 'insufficient_data';
  practice_name: string;
  practice_email: string;
}> {
  static type = 'conflict_check.completed' as const;
  type = ConflictCheckCompleted.type;
}
