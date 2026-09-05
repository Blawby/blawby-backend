import { describe, expect, it } from 'vitest';
import { deriveClientCheckins, deriveMatterRisks } from '@/modules/practice/services/practice-insights.service';

const now = new Date('2026-07-12T12:00:00Z');

describe('practice insights rules', () => {
  it('prioritizes urgency over recency for client check-in signals', () => {
    const clients = [
      { id: 'client-1', status: 'active', updated_at: new Date('2026-07-10T12:00:00Z'), intake_urgency: 'routine' },
      { id: 'client-2', status: 'active', updated_at: new Date('2026-05-01T12:00:00Z'), intake_urgency: null },
    ];
    const matters = [
      {
        id: 'matter-1',
        client_id: 'client-1',
        status: 'active',
        urgency: 'emergency',
        matter_type: 'Family',
        practice_service_name: null,
        responsible_attorney_id: 'attorney-1',
        retainer_balance: 1000,
        retainer_low_balance_threshold: 500,
        updated_at: new Date('2026-07-10T12:00:00Z'),
      },
    ];

    const result = deriveClientCheckins(clients, [], matters, now);

    expect(result).toMatchObject([
      { client_id: 'client-1', signal: 'frustrated', highest_urgency: 'emergency', open_matter_count: 1 },
      { client_id: 'client-2', signal: 'silent', last_contact_source: 'client-update', open_matter_count: 0 },
    ]);
  });

  it('uses memo event time as the client contact source', () => {
    const result = deriveClientCheckins(
      [{ id: 'client-1', status: 'active', updated_at: new Date('2026-01-01T00:00:00Z'), intake_urgency: null }],
      [
        {
          client_id: 'client-1',
          last_event_at: new Date('2026-07-11T12:00:00Z'),
          last_memo_at: new Date('2026-07-10T12:00:00Z'),
        },
      ],
      [],
      now
    );

    expect(result[0]).toMatchObject({
      signal: 'calm',
      recency_days: 1,
      last_contact_at: '2026-07-11T12:00:00.000Z',
      last_contact_source: 'memo-event',
    });
  });

  it('flags a stale client as silent before applying time-sensitive urgency', () => {
    const result = deriveClientCheckins(
      [
        {
          id: 'client-1',
          status: 'active',
          updated_at: new Date('2026-05-01T00:00:00Z'),
          intake_urgency: 'time_sensitive',
        },
      ],
      [],
      [],
      now
    );

    expect(result[0]).toMatchObject({ signal: 'silent', highest_urgency: 'time_sensitive' });
  });

  it('derives explainable matter risk and tags without a model call', () => {
    const matters = [
      {
        id: 'urgent',
        client_id: null,
        status: 'active',
        urgency: 'emergency',
        matter_type: 'Criminal',
        practice_service_name: 'Criminal defense',
        responsible_attorney_id: 'attorney-1',
        retainer_balance: 1000,
        retainer_low_balance_threshold: 500,
        updated_at: new Date('2026-07-10T12:00:00Z'),
      },
      {
        id: 'warning',
        client_id: null,
        status: 'active',
        urgency: 'routine',
        matter_type: 'Family',
        practice_service_name: null,
        responsible_attorney_id: null,
        retainer_balance: 100,
        retainer_low_balance_threshold: 100,
        updated_at: new Date('2026-07-10T12:00:00Z'),
      },
      {
        id: 'quiet',
        client_id: null,
        status: 'closed',
        urgency: null,
        matter_type: null,
        practice_service_name: null,
        responsible_attorney_id: 'attorney-1',
        retainer_balance: 0,
        retainer_low_balance_threshold: null,
        updated_at: new Date('2026-05-01T12:00:00Z'),
      },
    ];

    const result = deriveMatterRisks(matters, [], now);

    expect(result[0]).toMatchObject({
      matter_id: 'urgent',
      signal: 'urgent',
      last_activity_source: 'matter-update',
      tags: ['active', 'emergency', 'Criminal defense'],
    });
    expect(result[1]).toMatchObject({ matter_id: 'warning', signal: 'warn' });
    expect(result[1].tags).toEqual(expect.arrayContaining(['unassigned', 'low-retainer']));
    expect(result[2]).toMatchObject({ matter_id: 'quiet', signal: 'quiet' });
  });

  it('uses logged activity recency for healthy and watch signals', () => {
    const matter = {
      id: 'matter-1',
      client_id: null,
      status: 'active',
      urgency: 'routine',
      matter_type: null,
      practice_service_name: null,
      responsible_attorney_id: 'attorney-1',
      retainer_balance: 1000,
      retainer_low_balance_threshold: 500,
      updated_at: new Date('2026-01-01T00:00:00Z'),
    };

    expect(
      deriveMatterRisks(
        [matter],
        [{ matter_id: matter.id, last_activity_at: new Date('2026-07-12T00:00:00Z') }],
        now
      )[0]
    ).toMatchObject({ signal: 'healthy', last_activity_source: 'activity-log' });
    expect(
      deriveMatterRisks(
        [matter],
        [{ matter_id: matter.id, last_activity_at: new Date('2026-07-07T00:00:00Z') }],
        now
      )[0]
    ).toMatchObject({ signal: 'warn', recency_days: 5, last_activity_source: 'activity-log' });
  });
});
