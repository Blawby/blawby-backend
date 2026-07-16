import { practiceInsightsQueries } from '@/modules/practice/database/queries/practice-insights.queries';
import type {
  ClientCheckinInsight,
  MatterRiskInsight,
  PracticeInsightsTopic,
} from '@/modules/practice/types/practice-insights.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';

const TERMINAL_MATTER_STATUSES = new Set(['closed', 'declined', 'conflicted', 'referred']);
const SILENT_AFTER_DAYS = 30;
const RECENT_ACTIVITY_DAYS = 1;

interface ClientSignalSource {
  id: string;
  updated_at: Date;
  intake_urgency: string | null;
}

interface MemoActivitySource {
  client_id: string;
  last_event_at: Date | null;
  last_memo_at: Date | null;
}

interface MatterSignalSource {
  id: string;
  client_id: string | null;
  status: string;
  urgency: string | null;
  matter_type: string | null;
  practice_service_name: string | null;
  responsible_attorney_id: string | null;
  retainer_balance: number;
  retainer_low_balance_threshold: number | null;
  updated_at: Date;
}

interface MatterActivitySource {
  matter_id: string;
  last_activity_at: Date | null;
}

const recencyDays = (date: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));

const urgencyRank = (urgency: string | null): number => {
  if (urgency === 'emergency') {
    return 3;
  }
  if (urgency === 'time_sensitive') {
    return 2;
  }
  if (urgency === 'routine') {
    return 1;
  }
  return 0;
};

const highestUrgency = (values: readonly (string | null)[]): 'routine' | 'time_sensitive' | 'emergency' | null => {
  let highest: 'routine' | 'time_sensitive' | 'emergency' | null = null;
  for (const value of values) {
    if (urgencyRank(value) > urgencyRank(highest)) {
      if (value === 'routine' || value === 'time_sensitive' || value === 'emergency') {
        highest = value;
      }
    }
  }
  return highest;
};

const deriveClientCheckins = (
  clients: readonly ClientSignalSource[],
  memos: readonly MemoActivitySource[],
  matters: readonly MatterSignalSource[],
  now: Date
): ClientCheckinInsight[] => {
  const memoByClient = new Map(memos.map((memo) => [memo.client_id, memo]));
  const mattersByClient = new Map<string, MatterSignalSource[]>();
  for (const matter of matters) {
    if (matter.client_id && !TERMINAL_MATTER_STATUSES.has(matter.status)) {
      const current = mattersByClient.get(matter.client_id) ?? [];
      current.push(matter);
      mattersByClient.set(matter.client_id, current);
    }
  }

  return clients.map((client) => {
    const memo = memoByClient.get(client.id);
    const lastContact = memo?.last_event_at ?? memo?.last_memo_at ?? client.updated_at;
    let lastContactSource: ClientCheckinInsight['last_contact_source'] = 'client-update';
    if (memo?.last_event_at) {
      lastContactSource = 'memo-event';
    } else if (memo?.last_memo_at) {
      lastContactSource = 'memo';
    }
    const days = recencyDays(lastContact, now);
    const openMatters = mattersByClient.get(client.id) ?? [];
    const urgency = highestUrgency([client.intake_urgency, ...openMatters.map((matter) => matter.urgency)]);
    const reasons: string[] = [];
    let signal: ClientCheckinInsight['signal'] = 'calm';
    if (urgency === 'emergency') {
      signal = 'frustrated';
      reasons.push('emergency matter or intake urgency');
    } else if (days >= SILENT_AFTER_DAYS) {
      signal = 'silent';
      reasons.push(
        `${lastContactSource === 'client-update' ? 'no memo contact; client record unchanged' : 'no recorded memo contact'} for ${days} days`
      );
    } else if (urgency === 'time_sensitive') {
      signal = 'anxious';
      reasons.push('time-sensitive matter or intake urgency');
    } else {
      reasons.push(
        lastContactSource === 'client-update'
          ? 'recent client record update with no elevated urgency; no memo contact is recorded'
          : 'recent memo contact with no elevated urgency'
      );
    }
    return {
      client_id: client.id,
      signal,
      last_contact_at: lastContact.toISOString(),
      last_contact_source: lastContactSource,
      recency_days: days,
      open_matter_count: openMatters.length,
      highest_urgency: urgency,
      reasons,
    };
  });
};

const deriveMatterRisks = (
  matters: readonly MatterSignalSource[],
  activity: readonly MatterActivitySource[],
  now: Date
): MatterRiskInsight[] => {
  const activityByMatter = new Map(activity.map((item) => [item.matter_id, item.last_activity_at]));
  return matters.map((matter) => {
    const loggedActivity = activityByMatter.get(matter.id);
    const lastActivity = loggedActivity ?? matter.updated_at;
    const lastActivitySource = loggedActivity ? 'activity-log' : 'matter-update';
    const days = recencyDays(lastActivity, now);
    const lowRetainer =
      matter.retainer_low_balance_threshold !== null &&
      matter.retainer_balance <= matter.retainer_low_balance_threshold;
    const tags = [matter.status];
    if (matter.urgency) {
      tags.push(matter.urgency);
    }
    if (matter.practice_service_name) {
      tags.push(matter.practice_service_name);
    } else if (matter.matter_type) {
      tags.push(matter.matter_type);
    }
    if (!matter.responsible_attorney_id) {
      tags.push('unassigned');
    }
    if (lowRetainer) {
      tags.push('low-retainer');
    }
    if (days >= SILENT_AFTER_DAYS) {
      tags.push('inactive-30d');
    }

    const reasons: string[] = [];
    let signal: MatterRiskInsight['signal'] = 'healthy';
    if (TERMINAL_MATTER_STATUSES.has(matter.status)) {
      signal = 'quiet';
      reasons.push(`matter status is ${matter.status}`);
    } else if (matter.urgency === 'emergency') {
      signal = 'urgent';
      reasons.push('matter urgency is emergency');
    } else if (matter.urgency === 'time_sensitive' || lowRetainer || !matter.responsible_attorney_id) {
      signal = 'warn';
      if (matter.urgency === 'time_sensitive') {
        reasons.push('matter urgency is time-sensitive');
      }
      if (lowRetainer) {
        reasons.push('retainer balance is at or below its threshold');
      }
      if (!matter.responsible_attorney_id) {
        reasons.push('no responsible attorney is assigned');
      }
    } else if (days >= SILENT_AFTER_DAYS) {
      signal = 'quiet';
      reasons.push(`no matter activity for ${days} days`);
    } else if (days > RECENT_ACTIVITY_DAYS) {
      signal = 'warn';
      reasons.push(`no matter activity for ${days} days`);
    } else {
      signal = 'healthy';
      reasons.push('recent activity with no elevated risk rules');
    }
    return {
      matter_id: matter.id,
      signal,
      last_activity_at: lastActivity.toISOString(),
      last_activity_source: lastActivitySource,
      recency_days: days,
      tags,
      reasons,
    };
  });
};

const getInsights = async ({ topic }: { topic: PracticeInsightsTopic }, ctx: ServiceContext) => {
  const now = new Date();
  if (topic === 'client-checkins') {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Client');
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
    const [clients, memos, matters] = await Promise.all([
      practiceInsightsQueries.listClients(ctx.organizationId),
      practiceInsightsQueries.listClientMemoActivity(ctx.organizationId),
      practiceInsightsQueries.listMatters(ctx.organizationId),
    ]);
    return { topic, generated_at: now.toISOString(), data: deriveClientCheckins(clients, memos, matters, now) };
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  const [matters, activity] = await Promise.all([
    practiceInsightsQueries.listMatters(ctx.organizationId),
    practiceInsightsQueries.listMatterActivity(ctx.organizationId),
  ]);
  return { topic, generated_at: now.toISOString(), data: deriveMatterRisks(matters, activity, now) };
};

export const practiceInsightsService = { getInsights };

export { deriveClientCheckins, deriveMatterRisks };
