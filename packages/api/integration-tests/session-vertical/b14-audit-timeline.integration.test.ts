import { Client } from '@medusajs/framework/pg';
import { randomBytes } from 'node:crypto';
import { validateAuditIndexEnvelope, projectFoundationAuditEvent } from '../../src/modules/dogruadres-audit-index/envelope';
import { cursorKey, pagination, encodeCursor, decodeCursor, timelinePage, TimelineError } from '../../src/api/dogruadres/audit-timeline';
import { requireOrganizationAccess } from '../../src/api/dogruadres/authorization';

const DB_URL = process.env.B14_DATABASE_URL || 'postgres://b14_user:b14_secure_test_pw@127.0.0.1:55780/b14_test_db';
const CURSOR_KEY = process.env.DOGRUADRES_AUDIT_CURSOR_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('M0 B14 - Audit Timeline Integration Tests (Real PG16 Ephemeral)', () => {
  let db: InstanceType<typeof Client>;
  const testRunId = randomBytes(4).toString('hex');
  const orgId = 'da_org_b14_' + testRunId;
  const ownerPersonId = 'da_prs_owner_' + testRunId;
  const adminPersonId = 'da_prs_admin_' + testRunId;
  const memberPersonId = 'da_prs_member_' + testRunId;

  beforeAll(async () => {
    try {
      db = new Client({ connectionString: DB_URL });
      await db.connect();

      // Verify isolated DB
      const res = await db.query('SELECT current_database(), current_user');
      expect(res.rows[0].current_database).toBe('b14_test_db');

      // Setup Persons
      for (const pId of [ownerPersonId, adminPersonId, memberPersonId]) {
        await db.query('INSERT INTO da_person(id, created_at, updated_at) VALUES($1, NOW(), NOW())', [pId]);
      }

      // Setup base organization in DB
      await db.query(
        'INSERT INTO da_organization(id, name, status, created_at, updated_at) VALUES($1, $2, $3, NOW(), NOW())',
        [orgId, 'Test Org ' + testRunId, 'active']
      );

      // Setup memberships
      await db.query(
        'INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())',
        ['da_mem_owner_' + testRunId, orgId, ownerPersonId, 'owner', 'active', true]
      );
      await db.query(
        'INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())',
        ['da_mem_admin_' + testRunId, orgId, adminPersonId, 'admin', 'active', false]
      );
      await db.query(
        'INSERT INTO da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())',
        ['da_mem_member_' + testRunId, orgId, memberPersonId, 'member', 'active', false]
      );

      // Insert an initial row in da_audit_event so row-level append-only triggers have a target
      const initEventId = 'da_aud_init_' + testRunId;
      await db.query(
        'INSERT INTO da_audit_event(id, actor_person_id, actor_type, actor_id, role_context, organization_id, action, module, resource, target_id, occurred_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())',
        [initEventId, ownerPersonId, 'user', 'usr_' + testRunId, 'owner', orgId, 'organization.provisioned', 'dogruadres-access', 'organization', orgId]
      );
    } catch (err: any) {
      console.error('BEFORE ALL FAILED:', err);
      throw err;
    }
  });

  afterAll(async () => {
    if (db) {
      await db.end();
    }
  });

  it('1. Verifies append-only protection triggers on da_audit_event', async () => {
    const triggers = await db.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'da_audit_event'::regclass AND NOT tgisinternal ORDER BY tgname"
    );
    const triggerNames = triggers.rows.map((r: any) => r.tgname);
    expect(triggerNames).toContain('da_audit_event_append_only_rows');
    expect(triggerNames).toContain('da_audit_event_append_only_truncate');

    // Test that direct UPDATE is blocked by the row-level trigger
    let updateFailed = false;
    try {
      await db.query("UPDATE da_audit_event SET action = 'tampered'");
    } catch (e: any) {
      updateFailed = true;
      expect(e.message).toContain('append-only');
    }
    expect(updateFailed).toBe(true);

    // Test that direct DELETE is blocked by the row-level trigger
    let deleteFailed = false;
    try {
      await db.query('DELETE FROM da_audit_event');
    } catch (e: any) {
      deleteFailed = true;
      expect(e.message).toContain('append-only');
    }
    expect(deleteFailed).toBe(true);
  });

  it('2. Atomically records source audit event and outbox row with delivery metadata', async () => {
    const eventId = 'da_aud_evt_' + testRunId + '_1';
    const outboxId = 'da_aob_' + testRunId + '_1';
    const occurredAt = new Date().toISOString();

    const envelope = {
      source_audit_event_id: eventId,
      source_module: 'dogruadres-access',
      action: 'organization.provisioned',
      actor: { type: 'user', id: 'usr_' + testRunId },
      occurred_at: occurredAt,
      organization_id: orgId,
      summary: 'Organization provisioned',
      payload: { org_id: orgId, name: 'Test Org ' + testRunId },
      metadata: { correlation_id: 'corr_' + testRunId }
    };

    // Atomic transaction
    await db.query('BEGIN');
    try {
      await db.query(
        'INSERT INTO da_audit_event(id, actor_person_id, actor_type, actor_id, role_context, organization_id, action, module, resource, target_id, occurred_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)',
        [eventId, ownerPersonId, 'user', 'usr_' + testRunId, 'owner', orgId, 'organization.provisioned', 'dogruadres-access', 'organization', orgId, occurredAt]
      );
      await db.query(
        'INSERT INTO da_audit_outbox(id, source_audit_event_id, source_module, envelope_version, envelope, status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $7, $7)',
        [outboxId, eventId, 'dogruadres-access', 1, JSON.stringify(envelope), 'pending', occurredAt]
      );
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    // Verify row in da_audit_event
    const eventRow = await db.query('SELECT * FROM da_audit_event WHERE id = $1', [eventId]);
    expect(eventRow.rows.length).toBe(1);
    expect(eventRow.rows[0].action).toBe('organization.provisioned');

    // Verify outbox row with new delivery columns
    const outboxRow = await db.query('SELECT * FROM da_audit_outbox WHERE id = $1', [outboxId]);
    expect(outboxRow.rows.length).toBe(1);
    expect(outboxRow.rows[0].status).toBe('pending');
    expect(outboxRow.rows[0].attempt_count).toBe(0);
    expect(outboxRow.rows[0].delivered_at).toBeNull();
  });

  it('3. Relays outbox to Audit Index projection and acknowledges outbox', async () => {
    const eventId = 'da_aud_evt_' + testRunId + '_1';
    const outboxId = 'da_aob_' + testRunId + '_1';

    // Claim lease
    const leaseToken = 'lease_' + randomBytes(8).toString('hex');
    const claimRes = await db.query(
      "UPDATE da_audit_outbox SET lease_token = $1, lease_expires_at = NOW() + INTERVAL '30 seconds', attempt_count = attempt_count + 1 WHERE id = $2 AND status = 'pending' RETURNING *",
      [leaseToken, outboxId]
    );
    expect(claimRes.rows.length).toBe(1);
    expect(claimRes.rows[0].attempt_count).toBe(1);

    // Validate projection from source event
    const sourceEvent = {
      module: 'dogruadres-access',
      id: eventId,
      organization_id: orgId,
      actor_person_id: ownerPersonId,
      actor_type: 'user',
      actor_id: 'usr_' + testRunId,
      role_context: 'owner',
      action: 'organization.provisioned',
      resource: 'organization',
      target_id: orgId,
      occurred_at: new Date().toISOString(),
    };
    const projected = projectFoundationAuditEvent(sourceEvent);
    expect(projected.action).toBe('organization.provisioned');
    expect(projected.resource).toBe('organization');

    // Project into da_audit_index_entry
    const indexEntryId = 'da_idx_' + testRunId + '_1';
    await db.query(
      'INSERT INTO da_audit_index_entry(id, source_module, source_event_id, envelope_version, organization_id, actor_person_id, actor_type, actor_id, action, resource, target_id, occurred_at, indexed_at, envelope, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, NOW(), NOW())',
      [
        indexEntryId,
        projected.source_module,
        projected.source_event_id,
        projected.version,
        projected.organization_id,
        projected.actor.person_id,
        projected.actor.type,
        projected.actor.id,
        projected.action,
        projected.resource,
        projected.target_id,
        projected.occurred_at,
        JSON.stringify(projected)
      ]
    );

    // Acknowledge outbox
    const ackRes = await db.query(
      "UPDATE da_audit_outbox SET status = 'delivered', delivered_at = NOW(), lease_token = NULL, lease_expires_at = NULL WHERE id = $1 AND lease_token = $2 RETURNING *",
      [outboxId, leaseToken]
    );
    expect(ackRes.rows.length).toBe(1);
    expect(ackRes.rows[0].status).toBe('delivered');
    expect(ackRes.rows[0].delivered_at).not.toBeNull();

    // Verify index entry persisted
    const idxRes = await db.query('SELECT * FROM da_audit_index_entry WHERE id = $1', [indexEntryId]);
    expect(idxRes.rows.length).toBe(1);
    expect(idxRes.rows[0].source_event_id).toBe(eventId);
    expect(idxRes.rows[0].source_module).toBe('dogruadres-access');
  });

  it('4. Idempotently rejects duplicate projection identity (source_module, source_event_id)', async () => {
    const eventId = 'da_aud_evt_' + testRunId + '_1';
    let duplicateRejected = false;
    try {
      await db.query(
        'INSERT INTO da_audit_index_entry(id, source_module, source_event_id, envelope_version, organization_id, actor_person_id, actor_type, actor_id, action, resource, target_id, occurred_at, indexed_at, envelope, created_at, updated_at) VALUES($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, NOW(), NOW())',
        ['da_idx_dup_' + testRunId, 'dogruadres-access', eventId, orgId, ownerPersonId, 'user', 'usr_x', 'organization.provisioned', 'organization', orgId, '{}']
      );
    } catch (e: any) {
      duplicateRejected = true;
      expect(e.message).toContain('unique');
    }
    expect(duplicateRejected).toBe(true);
  });

  it('5. Queries timeline with pagination and verifies cursor encryption', async () => {
    // Insert 2 more index entries to test ordering and pagination
    for (let i = 2; i <= 4; i++) {
      const eId = 'da_aud_evt_' + testRunId + '_' + i;
      const occurred = new Date(Date.now() + i * 1000).toISOString();
      const envelope = {
        version: 1,
        source_module: 'dogruadres-access',
        source_event_id: eId,
        organization_id: orgId,
        actor: { person_id: ownerPersonId, type: 'user', id: 'usr_' + testRunId, role_context: 'owner' },
        action: 'organization.membership_changed',
        resource: 'membership',
        target_id: 'mem_' + i,
        occurred_at: occurred,
      };
      await db.query(
        'INSERT INTO da_audit_index_entry(id, source_module, source_event_id, envelope_version, organization_id, actor_person_id, actor_type, actor_id, action, resource, target_id, occurred_at, indexed_at, envelope, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, NOW(), NOW())',
        [
          'da_idx_' + testRunId + '_' + i,
          'dogruadres-access',
          eId,
          1,
          orgId,
          ownerPersonId,
          'user',
          'usr_' + testRunId,
          'organization.membership_changed',
          'membership',
          'mem_' + i,
          occurred,
          JSON.stringify(envelope)
        ]
      );
    }

    // Page 1 with limit = 2
    const page1 = await timelinePage(
      { limit: '2' },
      async () => ({ organizationId: orgId, personId: ownerPersonId }),
      async (organizationId, limit, boundary) => {
        let sql = 'SELECT * FROM da_audit_index_entry WHERE organization_id = $1 AND deleted_at IS NULL';
        const params: any[] = [organizationId];
        if (boundary) {
          sql += ' AND (occurred_at < $2 OR (occurred_at = $2 AND id < $3))';
          params.push(new Date(boundary.occurred_at), boundary.id);
        }
        sql += ' ORDER BY occurred_at DESC, id DESC LIMIT ' + (limit + 1);
        const rows = await db.query(sql, params);
        return rows.rows.map((r: any) => ({
          id: r.id,
          source_module: r.source_module,
          source_event_id: r.source_event_id,
          occurred_at: r.occurred_at,
          indexed_at: r.indexed_at,
          action: r.action,
          resource: r.resource,
          target_id: r.target_id,
          actor_person_id: r.actor_person_id
        }));
      },
      () => CURSOR_KEY
    );

    expect(page1.items.length).toBe(2);
    expect(page1.page.has_more).toBe(true);
    expect(page1.page.next_cursor).toBeDefined();
    expect(page1.projection.consistency).toBe('eventual');
    expect(page1.projection.completeness).toBe('not_guaranteed');

    // Verify next_cursor can be decoded
    const key = cursorKey(CURSOR_KEY);
    const decoded = decodeCursor(page1.page.next_cursor!, { organizationId: orgId, personId: ownerPersonId, limit: 2 }, key);
    expect(decoded.id).toBeDefined();
    expect(decoded.occurred_at).toBeDefined();

    // Tampered cursor should fail decode
    expect(() => decodeCursor('invalid_cursor_string', { organizationId: orgId, personId: ownerPersonId, limit: 2 }, key)).toThrow();

    // Cursor bound to a different person should fail decode
    expect(() => decodeCursor(page1.page.next_cursor!, { organizationId: orgId, personId: 'da_prs_different', limit: 2 }, key)).toThrow();

    // Cursor bound to a different org should fail decode
    expect(() => decodeCursor(page1.page.next_cursor!, { organizationId: 'da_org_different', personId: ownerPersonId, limit: 2 }, key)).toThrow();

    // Page 2 using cursor
    const page2 = await timelinePage(
      { limit: '2', cursor: page1.page.next_cursor! },
      async () => ({ organizationId: orgId, personId: ownerPersonId }),
      async (organizationId, limit, boundary) => {
        let sql = 'SELECT * FROM da_audit_index_entry WHERE organization_id = $1 AND deleted_at IS NULL';
        const params: any[] = [organizationId];
        if (boundary) {
          sql += ' AND (occurred_at < $2 OR (occurred_at = $2 AND id < $3))';
          params.push(new Date(boundary.occurred_at), boundary.id);
        }
        sql += ' ORDER BY occurred_at DESC, id DESC LIMIT ' + (limit + 1);
        const rows = await db.query(sql, params);
        return rows.rows.map((r: any) => ({
          id: r.id,
          source_module: r.source_module,
          source_event_id: r.source_event_id,
          occurred_at: r.occurred_at,
          indexed_at: r.indexed_at,
          action: r.action,
          resource: r.resource,
          target_id: r.target_id,
          actor_person_id: r.actor_person_id
        }));
      },
      () => CURSOR_KEY
    );

    expect(page2.items.length).toBe(2);
    // Overlap test: none of the page 2 items should be in page 1
    const p1Ids = page1.items.map(i => i.id);
    const p2Ids = page2.items.map(i => i.id);
    for (const id of p2Ids) {
      expect(p1Ids).not.toContain(id);
    }
  });

  it('6. Enforces authorization policy: Owner/Admin allowed, Member forbidden', async () => {
    const createReq = (actorId: string, role: string, status: string = 'active') => ({
      auth_context: { actor_id: actorId, actor_type: 'user' },
      scope: {
        resolve: () => ({
          resolvePersonForActor: async () => ({ id: 'prs_' + actorId }),
          getActiveMembership: async () => (status === 'active' ? { id: 'mem_' + actorId, role, status } : null),
          getOrganization: async () => ({ id: orgId, status: 'active' }),
        })
      }
    } as any);

    // Owner allowed
    const ownerRes = await requireOrganizationAccess(createReq('owner_1', 'owner'), orgId, 'audit.timeline.read');
    expect(ownerRes.personId).toBe('prs_owner_1');

    // Admin allowed
    const adminRes = await requireOrganizationAccess(createReq('admin_1', 'admin'), orgId, 'audit.timeline.read');
    expect(adminRes.personId).toBe('prs_admin_1');

    // Member forbidden (throws MedusaError FORBIDDEN)
    let memberFailed = false;
    try {
      await requireOrganizationAccess(createReq('member_1', 'member'), orgId, 'audit.timeline.read');
    } catch (e: any) {
      memberFailed = true;
      expect(e.type).toBe('forbidden');
    }
    expect(memberFailed).toBe(true);

    // Revoked owner forbidden
    let revokedFailed = false;
    try {
      await requireOrganizationAccess(createReq('revoked_1', 'owner', 'revoked'), orgId, 'audit.timeline.read');
    } catch (e: any) {
      revokedFailed = true;
    }
    expect(revokedFailed).toBe(true);
  });

  it('7. Distinguishes genuine empty state from service outage', async () => {
    const emptyOrgId = 'da_org_empty_' + testRunId;

    // Genuine empty state query
    const emptyPage = await timelinePage(
      { limit: '20' },
      async () => ({ organizationId: emptyOrgId, personId: ownerPersonId }),
      async () => [],
      () => CURSOR_KEY
    );

    expect(emptyPage.items).toEqual([]);
    expect(emptyPage.page.has_more).toBe(false);
    expect(emptyPage.page.next_cursor).toBeNull();
    expect(emptyPage.projection.consistency).toBe('eventual');

    // Simulated outage: read throws error
    let outageCaught = false;
    try {
      await timelinePage(
        { limit: '20' },
        async () => ({ organizationId: orgId, personId: ownerPersonId }),
        async () => {
          throw new Error('Connection refused to audit index storage');
        },
        () => CURSOR_KEY
      );
    } catch (e: any) {
      outageCaught = true;
      expect(e).toBeInstanceOf(TimelineError);
      expect(e.status).toBe(503);
      expect(e.message).toBe('Audit timeline unavailable');
    }
    expect(outageCaught).toBe(true);
  });
});
