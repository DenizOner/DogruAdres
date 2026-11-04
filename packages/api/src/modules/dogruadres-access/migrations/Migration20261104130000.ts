import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Additive declaration-only fields. Existing private drafts retain their identity and version. */
export class Migration20261104130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table da_organization_application
      add column declared_activities jsonb not null default '[]'::jsonb,
      add column primary_activity text;`)
    this.addSql(`alter table da_organization_application
      add constraint da_org_application_activities_check check (
        jsonb_typeof(declared_activities)='array'
        and jsonb_array_length(declared_activities) <= 6
        and declared_activities <@
          '["service_repair","retail_store","wholesale_distribution","manufacturing","fleet_operations","insurance_claims"]'::jsonb
        and (
          (declared_activities='[]'::jsonb and primary_activity is null)
          or (declared_activities <> '[]'::jsonb
            and primary_activity in ('service_repair','retail_store',
              'wholesale_distribution','manufacturing','fleet_operations','insurance_claims')
            and declared_activities @> jsonb_build_array(primary_activity))
        )
      );`)
  }
  override async down(): Promise<void> {
    throw new Error("Organization draft activity declarations require reviewed retention")
  }
}
