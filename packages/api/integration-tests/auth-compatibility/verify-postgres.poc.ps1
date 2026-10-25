$ErrorActionPreference='Stop'
$name='dogruadres-auth218-20261020-postgres'
$container = docker inspect $name | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $container.Config.Labels.'dogruadres.task' -ne 'issue-218' -or
   $container.Config.Labels.'dogruadres.owner' -ne 'auth218-20261020' -or
   $container.Image -ne 'sha256:621a761097839bdb50207afd6b87a72f38e2d718dd46c3d744828d8917c4f1e0') { throw 'Container ownership mismatch' }
$sql=@'
BEGIN READ ONLY;
SELECT json_build_object(
 'database',current_database(),'version',current_setting('server_version'),'recovery',pg_is_in_recovery(),
 'people',(SELECT count(*) FROM da_person), 'mappings',(SELECT count(*) FROM da_actor_mapping),
 'organizations',(SELECT count(*) FROM da_organization),'memberships',(SELECT count(*) FROM da_organization_membership),
 'audits',(SELECT count(*) FROM da_audit_event),'pending',(SELECT count(*) FROM da_organization_invitation WHERE status='pending'),
 'auth_identities',(SELECT count(*) FROM auth_identity),'seller_memberships',(SELECT count(*) FROM seller_member),
 'primary_bindings',(SELECT count(*) FROM da_actor_mapping a JOIN da_person p ON p.id=a.person_id WHERE p.display_name='Synthetic auth218 primary'),
 'primary_types',(SELECT count(DISTINCT a.actor_type) FROM da_actor_mapping a JOIN da_person p ON p.id=a.person_id WHERE p.display_name='Synthetic auth218 primary'),
 'duplicate_keys',(SELECT count(*) FROM (SELECT actor_type,actor_id FROM da_actor_mapping GROUP BY actor_type,actor_id HAVING count(*)>1) x),
 'concurrent_orgs',(SELECT count(*) FROM da_organization WHERE name IN ('Synthetic auth218 concurrent A','Synthetic auth218 concurrent B')),
 'concurrent_people',(SELECT count(DISTINCT m.person_id) FROM da_organization_membership m JOIN da_organization o ON o.id=m.organization_id WHERE o.name IN ('Synthetic auth218 concurrent A','Synthetic auth218 concurrent B')),
 'concurrent_memberships',(SELECT count(*) FROM da_organization_membership m JOIN da_organization o ON o.id=m.organization_id WHERE o.name IN ('Synthetic auth218 concurrent A','Synthetic auth218 concurrent B')),
 'revoked_primary',(SELECT count(*) FROM da_organization_membership m JOIN da_person p ON p.id=m.person_id JOIN da_organization o ON o.id=m.organization_id WHERE p.display_name='Synthetic auth218 primary' AND o.name='Synthetic auth218 XYZ' AND m.status='revoked'),
 'active_primary',(SELECT count(*) FROM da_organization_membership m JOIN da_person p ON p.id=m.person_id JOIN da_organization o ON o.id=m.organization_id WHERE p.display_name='Synthetic auth218 primary' AND o.name='Synthetic auth218 ABC' AND m.status='active')
);
ROLLBACK;
'@
$output=$sql | docker exec -i $name psql -X -qAt -v ON_ERROR_STOP=1 -U auth218_test -d auth218_20261020
if($LASTEXITCODE -ne 0){throw 'Read-only SQL verification failed'}
$data=$output | ConvertFrom-Json
$checks=@(
 ($data.database -eq 'auth218_20261020' -and $data.version -eq '16.15' -and !$data.recovery),
 ($data.people -eq 5 -and $data.mappings -eq 9),
 ($data.organizations -eq 4 -and $data.memberships -eq 5),
 ($data.audits -eq 6 -and $data.pending -eq 1),
 ($data.auth_identities -eq 5 -and $data.seller_memberships -eq 2),
 ($data.primary_bindings -eq 3 -and $data.primary_types -eq 3 -and $data.duplicate_keys -eq 0),
 ($data.concurrent_orgs -eq 2 -and $data.concurrent_memberships -eq 2 -and $data.concurrent_people -eq 1),
 ($data.revoked_primary -eq 1 -and $data.active_primary -eq 1)
)
$data | ConvertTo-Json -Compress
$failed=@($checks | Where-Object { !$_ }).Count
"POSTGRES_ASSERTIONS=$($checks.Count) PASSED=$($checks.Count-$failed) FAILED=$failed"
if($failed){exit 1}; exit 0
