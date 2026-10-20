# Organization Team Selection And Automatic Approval

The Add/Edit User team dropdown shows one entry each for System, Network, Cloud, CMS, Service Desk, PRT, Delivery & Client, BSD, Service and Solution. Every level can select every team. Organization Level displays CONSULTANT in uppercase. Team is stored separately on UserOrganizationAssignment; legacy tags remain available for existing warehouse/BSD workflow compatibility.

Warehouse is an additional team option. MANAGER + Warehouse maps to WAREHOUSE_MANAGER and existing warehouse-manager assignments are displayed with this team through the legacy-tag mapper, without a database backfill. This organizational tag does not appoint the user to every warehouse: warehouse-specific manager assignments and permissions remain controlled by the existing warehouse settings. Changes are persisted only when the administrator saves the user form.

Known legacy mappings are preserved: System=S1, Network=N1, Cloud=C1, CMS=CMS, Service Desk=SD, PRT=PRT, Delivery & Client=DL, BSD=BSD, Service=CS and Solution=SC. New combinations use a generic position tag (STAFF/SUPERVISOR/MANAGER/CONSULTANT/EXECUTIVE) plus the independent team. The primary assignment uses a team/level/tag key, so generic tags in different teams do not collapse together.

## Automatic Next Head

No Reports To field is required or stored. New request approvals derive exactly one organizational approver from the requester's primary active team/level. STAFF checks SUPERVISOR then MANAGER within its team, and SUPERVISOR checks MANAGER. Empty/inactive positions are skipped upward. The organization chart then supplies parent positions:

- System/Network/Cloud: Solution Manager, Service Manager, technical Executive (Solution).
- CMS/Service Desk/PRT: Service Supervisor, Service Manager, technical Executive (Solution).
- Solution: Service Manager, technical Executive (Solution).
- Service and Delivery & Client: technical Executive (Solution).
- BSD: BSD Executive.
- CONSULTANT: the Executive branch directly; no supervisor/manager steps.

Routing stops at the first occupied position and creates one concrete-user DIRECT_MANAGER approval row, not an approval for every level. Multiple active users in the same candidate position fail with AMBIGUOUS_SUPERVISOR rather than selecting by name. If the whole branch has no available head, SUPERVISOR_NOT_CONFIGURED reports that no higher account exists. An EXECUTIVE requester has no organizational supervisor step. Project Lead, Storeman, BSD sale and return-specific gates remain separate and unchanged; existing approval snapshots are not rebuilt by a team migration.

Legacy WAREHOUSE_MANAGER, SCN_MANAGER, EN_MANAGER and LOCAL_* assignments remain preserved without guessing a team. Existing warehouse-manager assignments are not removed. Unknown primary organization context cannot be assigned to a random department during routing.

Migration 202610200003 adds CONSULTANT; 202610200004 adds independent team and generic position tags and backfills confirmed legacy mappings. Despite its historical directory name, migration 0004 does not add Reports To columns. Organization-specific account corrections are operator-managed data changes, not part of the public repository or automatic migrations. The approved local chart correction makes Thawanat J. Service Supervisor and CMS Manager while preserving his warehouse-manager assignment. On another environment, review and apply equivalent assignments through User Management before enabling the new routing; migrations alone do not resolve duplicate Service managers. Missing executive/manager accounts are not automatically provisioned.

Run `npx tsx scripts/report-organization-routing.ts` for a read-only report of the next approver. As verified on 2026-10-20, Surarux S., Suriya K. and Theerajed Th. have no available higher account anywhere in their respective branches; empty positions are skipped but these users still need a real higher account to exist. Admin/local stock-controller accounts without organization assignments are not silently mapped to a business team.
