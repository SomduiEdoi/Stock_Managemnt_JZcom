# Legacy Used Model Mapping Review

> Historical snapshot: 2026-10-05, not a live database inventory. Documentation reviewed 2026-10-16. Counts, UUIDs and revision below are preserved as audit evidence, not current mapping approval. Generate a fresh read-only report and obtain explicit approval before any apply; see [Tasks](task.md).

Inspected: 2026-10-05. Source: actual DB through `src/lib/db.ts`, in a repeatable-read READ ONLY transaction. No live apply or DB mutation was executed.

Revision: `4016782007c513a4b76377331b1f034049cdb4b7a32346eec4a1bacc44d7d7a2`

Found 38 legacy Used models: 23 strict safe proposals, 15 blocked/manual-review cases. Proposals are NOT approval. All inspected legacy stock rows currently have condition NEW.

## Strict Rules

- Strip only an explicit trailing `(Used)` marker from name/description. No fuzzy product matching.
- Require exact warehouse, category, asset type, brand, model number, part number, type name, base name and base description. Require nonempty brand and part or model number.
- Require one canonical target and one legacy source for that identity. Both non-serialized; target active.
- Block missing stock codes, invalid quantities/conditions, serial numbers, warehouse conflicts, locks, reservations and unresolved transaction references.
- Related candidates are same-warehouse name/description hints ONLY, not accepted mappings. One related candidate does not prove identity.

## Safe Proposals

| Part Number | Used Model ID | Canonical Model ID | Asset ID | Stock Code | Quantity |
| --- | --- | --- | --- | --- | ---: |
| US-5103LZ-5 | 1039129c-a995-41e2-9a11-8f6923122999 | 5613b4da-627d-4e86-864d-15a8233990c5 | f89df1aa-9724-43aa-aeac-965a5c970d0b | IN-LA-PCL0030 | 1 |
| UTP6A5BU | 2f89902b-6cca-4136-b674-17af0f5643ca | 7bb542aa-02a9-4f7a-a63c-ff558eca9321 | d373e3d7-3f25-4416-a27a-e12dbd0c7b0e | IN-LA-PCL0007 | 2 |
| UFP422D31-05 | 43afd09f-ea94-4437-90e1-0d40975fef65 | fe3a1fcd-7831-46a3-9f36-44b3bde1162d | 567bc700-4422-4524-8a2a-fb5dc36d745b | IN-FB-OFM0046 | 1 |
| US-5105LZ-5 | 4916f05e-456a-4a3f-98f0-4dab5019278e | 15097b24-30b4-4d25-b27a-737d47e24ad6 | 281c152f-3072-471c-8335-10e6d59c1475 | IN-LA-PCL0041 | 6 |
| AMC-3663XG | 4be3226f-17ef-4a3f-bd2e-a0fe6788dc93 | 7c44f163-be9b-4d23-99b6-7ef8ad7ac8a9 | e60f4606-1cfc-46b4-80b0-f444a543ee92 | IN-LA-PCL0025 | 0 |
| US-5102LZ-4 | 557bfaca-d02a-4778-a951-c83f1ae6f8bc | 0c1b93e9-42bf-4b39-800c-f424c51fd53c | 6dd1ebe5-0c4f-4c98-9a9a-bed6d49cc58e | IN-LA-PCL0020 | 5 |
| US-5110LZ-3 | 6ca51418-3694-4f22-9d19-3d2be9be3622 | 20cfef81-c95b-4c69-b0e5-f49bc6e6d67b | c30f6bf6-eba0-4392-b6b7-5407dedd5350 | IN-LA-PCL0051 | 0 |
| US-5103LZ-3 | 6d3ada8e-1370-4a64-a9bd-cb19e0308d26 | a6e33548-ab66-4362-86fc-e60c6d85e13f | b57d6c7b-bda7-49d4-8ecd-611476eb9593 | IN-LA-PCL0032 | 1 |
| US-5103LZ-2 | 6fc70907-a540-4031-b4db-0aa062c4400e | e1d8bf01-d0e1-42d9-9893-afafdcb2a468 | 4c450751-1791-47cf-81ec-d830745ba378 | IN-LA-PCL0028 | 10 |
| NK6APC2MBU | 7a473bac-ba5f-44b9-b7b4-d857dd67a7b5 | 985d092e-2a12-4561-9302-302c83365334 | ad318a3c-e640-4c94-93f1-68136ce79a46 | IN-LA-PCL0018 | 2 |
| US-5103LZ-4 | 7e6410bd-7c45-4282-b8a6-a02619991fb7 | 52c5b652-0dee-439a-8101-22f9d71ddf9a | 13dbdd47-9bdb-41fd-8d01-6001cf5fd355 | IN-LA-PCL0022 | 14 |
| US-5101LZ-5 | 821b8915-7630-453d-8d09-296d65256188 | d43848b3-4788-4051-b12c-dd65b055b31b | dbf7d0f9-8656-4e6a-bf9b-f06e0dfda6f7 | IN-LA-PCL0016 | 2 |
| US-5110LZ-5 | 8bfc2246-8db4-4e57-874c-b6199ce5d77f | 327a3841-f246-4519-b1ef-ba4f94164d26 | 83b0c41c-6d0f-456e-a06e-62ca76e416c0 | IN-LA-PCL0049 | 0 |
| US-5105LZ-3 | 98a588ad-2250-449b-9703-55bc06e7a42e | 2eccf35d-4ed7-497c-8493-cf633f8c3d4c | 37e385d4-562a-4047-9f20-708a514d9450 | IN-LA-PCL0043 | 2 |
| US-5105LZ-2 | 9d0fa296-85b6-48cb-acb1-815ceff5cc15 | 6cc60bfd-c725-452b-bc68-db6f99d9670c | 5610fff8-11be-46c3-8ad0-1516bddf6da2 | IN-LA-PCL0039 | 3 |
| UFP422D31-10 | 9f94a041-09a2-4a91-a8d5-aee1dd1879ed | eb219173-11c8-44ca-8205-6e07316e7692 | 9b3675c8-743a-4f57-8675-51ae7a726a21 | IN-FB-OFM0052 | 1 |
| UFP422D31-03 | a6c8d8e5-5d67-4e4c-a58b-8c371ae0ebeb | 3c053694-6dc6-4981-9284-a930a250468d | 280173bd-a5a6-456c-bba3-a3945749ce57 | IN-FB-OFM0031 | 4 |
| US-5101LZ-4 | b1f820c2-cf37-4780-aa5b-e2f9b79ad5ba | f6e0447f-e153-4826-80e0-b909d164d1a2 | 8039aaa1-4bcd-46d1-9502-78fab9d9b2db | IN-LA-PCL0012 | 14 |
| US-5101LZ-2 | b8b241e9-2512-4488-afd4-ef85bc83f2e2 | dd5605f6-1cca-41a1-81e3-68722fd65898 | 77a9ed42-3c53-4589-ac19-7171fbff04db | IN-LA-PCL0014 | 7 |
| UFP322D31-10 | c5e60b12-7527-4ce0-958b-e959b938ee41 | 32ce59ac-8869-4cf2-a8d2-64ea16df50e5 | 6c5ac987-8fb5-4ec3-816b-de33e35233fe | IN-FB-OFM0058 | 7 |
| US-5105LZ-4 | ca0513f5-96b0-467b-adee-2b75895e57a6 | 141a0837-909e-4dfd-a73a-2ddf8b2afec4 | a3ddaeb5-a585-4e88-b203-ff4e2b8793b2 | IN-LA-PCL0034 | 5 |
| US-5110LZ-2 | d1f54dfc-c2ee-4eb9-8ce3-d5493657c0fe | e3b09b63-da29-408d-912c-74f63e5a4760 | 1d4065d4-c6ba-4c79-9d6e-1438d5378198 | IN-LA-PCL0047 | 0 |
| US-5110LZ-4 | d79812e2-9057-4c1c-bb52-1112e651da68 | 21fec031-258d-48fa-b3e7-8c51208ccfd8 | 57b35725-5408-490c-b70f-c0d36fbb9411 | IN-LA-PCL0045 | 1 |

## Blocked Manual Review

All cases below have zero strict matches. Do not guess. Check original records/specifications; reconcile metadata through the separately owned master-data workflow, then regenerate and review.

| Part Number | Used Model ID | Asset ID | Stock Code | Quantity | Related Candidate IDs (Not Approved) | Reasons |
| --- | --- | --- | --- | ---: | --- | --- |
| NKU6APC3MBU | 0d1f6554-abdd-43ec-bb5d-3fe79b9f4bd8 | 62be560c-9173-4049-a2ea-3ca9898b67d8 | IN-LA-PCL0026 | 11 | 8bc66030-e06b-4f2c-9588-c193f79e34a9 | Expected exactly one strict identity match; found 0 |
| UFP922S31-05 | 0e51dd79-4c06-44cb-bd41-701046911bef | 2da47ec0-0e65-4fab-a880-e58ef1d38448 | IN-FB-OFM0020 | 0 | (none) | Expected exactly one strict identity match; found 0 |
| 470-ACMO | 18c96260-4e17-4373-be07-3336af772f1f | e0643258-13f7-4840-bcff-cf4273220ffb | IN-FB-OFM0034 | 2 | 22d0a4ca-6edb-4418-a22f-359616e2eab8, 35f0a349-7e4f-4d3e-9b69-657f41af8f74 | Expected exactly one strict identity match; found 0 |
| 470-ACLY | 21c52a94-59b2-4900-95cc-c94f7f2f471c | 010f89ec-659b-4374-95c2-91d7bfe9fb4d | IN-FB-OFM0050 | 1 | 09c98d55-8ce2-4e36-b6df-19f2de8debed, 5fd10ca2-4a64-46b0-bd62-8b0d4c3a4ef0 | Expected exactly one strict identity match; found 0 |
| JT3-3M | 35b0623a-30a6-48cd-b1a5-9b925c2c8373 | 386e529e-411e-44de-bb34-bc7d2343f996 | IN-EL-SCK0002 | 3 | b24c7bc0-6a57-4975-9fdd-79f927c62fe3 | Expected exactly one strict identity match; found 0 |
| G3N-60615 | 44ddb62f-71fa-42e2-a59f-6d185783d537 | 3aa8bfe8-2023-44e2-bdba-43908ba7c75c | IN-RK-CBN0003 | 1 | (none) | Expected exactly one strict identity match; found 0 |
| G7-00006 | 4b69bc1c-8a3d-4495-87d1-c49a41510dae | e50b5856-93a5-4c9b-9174-c148d9a310f4 | IN-RK-ACC0001 | 1 | 9d595dc5-2608-4c57-917f-70921575a186 | Expected exactly one strict identity match; found 0 |
| UFP948S31-04 | 61a8264d-2797-4110-a586-7578ea21ab83 | 2e61478f-39f6-4933-b98d-3230fe935ac3 | IN-FB-OFM0015 | 2 | 5ec9716f-f5f7-4689-9352-095aa3830143 | Expected exactly one strict identity match; found 0 |
| HTS725050A7E631 | 707dae15-c2fc-4851-99ff-84774fccbdd1 | 83746f51-38fd-4fcb-a6e9-98d8222d431b | SS-ST-HDD0004 | 1 | (none) | Expected exactly one strict identity match; found 0 |
| JT5-3M | 7871ca66-8732-4512-b220-3aac3f121cb0 | 205899de-f926-4033-a1c7-65f0d619cb84 | IN-EL-SCK0004 | 2 | b24c7bc0-6a57-4975-9fdd-79f927c62fe3 | Expected exactly one strict identity match; found 0 |
| UFP942D31-03 | 86ec071f-2389-41f7-8b63-d855819537b7 | e74343ce-7768-462b-8c2b-c23ffb4647f8 | IN-FB-OFM0012 | 0 | a01c10ba-cbbd-4ffb-a1dd-5419177e93e4 | Expected exactly one strict identity match; found 0 |
| UFP322D31-05 | 9158b311-e0b0-450e-b7b5-8fa2add012cc | 2f2d3b09-b915-48b0-a468-812c55dd6d8f | IN-FB-OFM0048 | 1 | 09c98d55-8ce2-4e36-b6df-19f2de8debed, 5fd10ca2-4a64-46b0-bd62-8b0d4c3a4ef0 | Expected exactly one strict identity match; found 0 |
| JT4-3M | 97b48fc0-7ac5-49f7-a62f-51a8d83517fc | 9ab8cb16-4fe9-4e8e-93da-bf6d3defdab9 | IN-EL-SCK0003 | 15 | b24c7bc0-6a57-4975-9fdd-79f927c62fe3 | Expected exactly one strict identity match; found 0 |
| 1859247-7 | a7118edd-0e55-4742-82f7-15d77c5ae465 | d5e0527d-ab86-4951-a0bf-fc72171122f6 | IN-LA-PCL0010 | 24 | e039d924-f102-4d2e-8e1e-c97b38d80744, f5ab5f13-8e21-4a7a-a922-d001ea0e96a2 | Expected exactly one strict identity match; found 0 |
| (missing) | d9fa91ac-3c5c-48bf-bbd3-57c13c81135c | a972d0a3-5599-46f5-ad86-f6e1fb19c6b3 | SS-AD-ADP0003 | 2 | (none) | Expected exactly one strict identity match; found 0 |

## Operation And Audit

Default read-only command:

```powershell
npx tsx scripts/report-normalize-used-models.ts
```

Apply requires `--apply --mapping approved.json`. It was not executed. Mapping format example (NOT approval):

```json
{
  "version": 1,
  "approved": true,
  "revision": "4016782007c513a4b76377331b1f034049cdb4b7a32346eec4a1bacc44d7d7a2",
  "actorId": "REPLACE_WITH_REVIEWER_USER_UUID",
  "reason": "REPLACE_WITH_EXPLICIT_APPROVAL_REASON",
  "pairs": [
    {
      "usedModelId": "1039129c-a995-41e2-9a11-8f6923122999",
      "newModelId": "5613b4da-627d-4e86-864d-15a8233990c5"
    }
  ]
}
```

No approved mapping file was created. Select only explicitly reviewed safe pairs.

Apply re-reads models, assets, transactions/items, reservations and histories under serializable isolation and table write locks. It rejects changed revision, duplicate/reversed/unsafe pairs, invalid approval or missing audit actor. Lock timeout is 10 seconds; schedule a maintenance window for a separately authorized future apply.

Assets update in place: only assetModelId, condition=USED and updatedAt change. IDs, stock codes, quantities, warehouse/location, statuses and existing histories remain unchanged. No merging, deletion, new products or new codes. Old models become isActive=false; historical model references remain intact.

Append existing asset_status_histories per asset with STATUS_CHANGE, unchanged status, unchanged structured quantities, quantityChanged=0, condition=USED and actor. JSON note includes old/new model IDs, old/new condition, stock code, approval reason and snapshot revision. Audit failure rolls back the entire operation. Existing table is sufficient: no migration or schema change needed.

The revision covers the whole inspected inventory/workflow snapshot; even unrelated changes require a fresh report and explicit reapproval. No stale-approval retry.

## Manual Review Evidence

The values below are read from the database. Only the trailing Used marker is removed from source descriptions. Differences are evidence against automatic pairing, not permission to overwrite metadata.

### IN-LA-PCL0026

Source model: `0d1f6554-abdd-43ec-bb5d-3fe79b9f4bd8`. Base identity: {"name":"NetKey Cat 6","brand":"Panduit","partNo":"NKU6APC3MBU","modelNo":null,"description":"Patch Cord CAT6A 3M Blue(Used)"}.

Candidate `8bc66030-e06b-4f2c-9588-c193f79e34a9`: part_no: source "NKU6APC3MBU" vs candidate "NK6PC3MBUY"; description: source "Patch Cord CAT6A 3M Blue" vs candidate "Patch Cord CAT6 3M \"NK6PC3MBUY\" Blue".

Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0020

Source model: `0e51dd79-4c06-44cb-bd41-701046911bef`. Base identity: {"name":"LC to LC Simplex Sm","brand":"Link","partNo":"UFP922S31-05","modelNo":null,"description":"Single Mode LC-LC simplex 5M(Used)"}.

No same-warehouse base-name/description candidate exists. A product identifier match alone is not accepted.
Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0034

Source model: `18c96260-4e17-4373-be07-3336af772f1f`. Base identity: {"name":"Dell Networking LC-LC OM5","brand":"Dell","partNo":"470-ACMO","modelNo":null,"description":"Multi Mode OM4 LC-LC 50/125 3M (Used)"}.

Candidate `22d0a4ca-6edb-4418-a22f-359616e2eab8`: brand: source "Dell" vs candidate "Link"; part_no: source "470-ACMO" vs candidate "UFP322D31-03"; name: source "Dell Networking LC-LC OM5" vs candidate "LC to LC Duplex OM4".

Candidate `35f0a349-7e4f-4d3e-9b69-657f41af8f74`: name: source "Dell Networking LC-LC OM5" vs candidate "Dell Networking LC-LC OM4".

Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0050

Source model: `21c52a94-59b2-4900-95cc-c94f7f2f471c`. Base identity: {"name":"Dell Networking LC-LC OM5","brand":"Dell","partNo":"470-ACLY","modelNo":null,"description":"Multi Mode OM4 LC-LC 50/125 5M(Used)"}.

Candidate `09c98d55-8ce2-4e36-b6df-19f2de8debed`: brand: source "Dell" vs candidate "Link"; part_no: source "470-ACLY" vs candidate "UFP322D31-05"; name: source "Dell Networking LC-LC OM5" vs candidate "LC to LC Duplex OM4".

Candidate `5fd10ca2-4a64-46b0-bd62-8b0d4c3a4ef0`: name: source "Dell Networking LC-LC OM5" vs candidate "Dell Networking LC-LC OM4".

Blocked: Expected exactly one strict identity match; found 0.

### IN-EL-SCK0002

Source model: `35b0623a-30a6-48cd-b1a5-9b925c2c8373`. Base identity: {"name":"JT Series (มอก.)","brand":"Toshino","partNo":"JT3-3M","modelNo":null,"description":"Toshino Powerbar 3Sockets 3M. (Used)"}.

Candidate `b24c7bc0-6a57-4975-9fdd-79f927c62fe3`: part_no: source "JT3-3M" vs candidate "JT4-3M"; description: source "Toshino Powerbar 3Sockets 3M." vs candidate "Toshino Powerbar 4Sockets 3M.".

Blocked: Expected exactly one strict identity match; found 0.

### IN-RK-CBN0003

Source model: `44ddb62f-71fa-42e2-a59f-6d185783d537`. Base identity: {"name":"Free Standing Rack 15U","brand":"Germany","partNo":"G3N-60615","modelNo":null,"description":"Rack 15U (Used)"}.

No same-warehouse base-name/description candidate exists. A product identifier match alone is not accepted.
Blocked: Expected exactly one strict identity match; found 0.

### IN-RK-ACC0001

Source model: `4b69bc1c-8a3d-4495-87d1-c49a41510dae`. Base identity: {"name":"AC Power Distribution","brand":"Germany","partNo":"G7-00006","modelNo":null,"description":"Power Distribution 6 outlet (Used)"}.

Candidate `9d595dc5-2608-4c57-917f-70921575a186`: part_no: source "G7-00006" vs candidate "G7-00012"; description: source "Power Distribution 6 outlet" vs candidate "Power Distribution 12outlet".

Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0015

Source model: `61a8264d-2797-4110-a586-7578ea21ab83`. Base identity: {"name":"ST to FC Simplex Sm","brand":"Link","partNo":"UFP948S31-04","modelNo":null,"description":"Single Mode ST-FC simplex 3M(Used)"}.

Candidate `5ec9716f-f5f7-4689-9352-095aa3830143`: part_no: source "UFP948S31-04" vs candidate "UFP948S31-03".

Blocked: Expected exactly one strict identity match; found 0.

### SS-ST-HDD0004

Source model: `707dae15-c2fc-4851-99ff-84774fccbdd1`. Base identity: {"name":"HTS725050A7E630","brand":"HGST","partNo":"HTS725050A7E631","modelNo":null,"description":"HDD 2.5\" 500GB 7200RPM SATA 6Gb/s (Used)"}.

No same-warehouse base-name/description candidate exists. A product identifier match alone is not accepted.
Blocked: Expected exactly one strict identity match; found 0.

### IN-EL-SCK0004

Source model: `7871ca66-8732-4512-b220-3aac3f121cb0`. Base identity: {"name":"JT Series (มอก.)","brand":"Toshino","partNo":"JT5-3M","modelNo":null,"description":"Toshino Powerbar 5Sockets 3M. (Used)"}.

Candidate `b24c7bc0-6a57-4975-9fdd-79f927c62fe3`: part_no: source "JT5-3M" vs candidate "JT4-3M"; description: source "Toshino Powerbar 5Sockets 3M." vs candidate "Toshino Powerbar 4Sockets 3M.".

Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0012

Source model: `86ec071f-2389-41f7-8b63-d855819537b7`. Base identity: {"name":"ST to SC Duplex Sm","brand":"Link","partNo":"UFP942D31-03","modelNo":null,"description":"Single Mode ST-SC Duplex 3M (Used)"}.

Candidate `a01c10ba-cbbd-4ffb-a1dd-5419177e93e4`: part_no: source "UFP942D31-03" vs candidate "UFP946D31-03".

Blocked: Expected exactly one strict identity match; found 0.

### IN-FB-OFM0048

Source model: `9158b311-e0b0-450e-b7b5-8fa2add012cc`. Base identity: {"name":"LC to LC Duplex OM5","brand":"Link","partNo":"UFP322D31-05","modelNo":null,"description":"Multi Mode OM4 LC-LC 50/125 5M (Used)"}.

Candidate `09c98d55-8ce2-4e36-b6df-19f2de8debed`: name: source "LC to LC Duplex OM5" vs candidate "LC to LC Duplex OM4".

Candidate `5fd10ca2-4a64-46b0-bd62-8b0d4c3a4ef0`: brand: source "Link" vs candidate "Dell"; part_no: source "UFP322D31-05" vs candidate "470-ACLY"; name: source "LC to LC Duplex OM5" vs candidate "Dell Networking LC-LC OM4".

Blocked: Expected exactly one strict identity match; found 0.

### IN-EL-SCK0003

Source model: `97b48fc0-7ac5-49f7-a62f-51a8d83517fc`. Base identity: {"name":"JT Series (มอก.)","brand":"Toshino","partNo":"JT4-3M","modelNo":null,"description":"Toshino Powerbar 4Sockets 3M (Used)"}.

Candidate `b24c7bc0-6a57-4975-9fdd-79f927c62fe3`: description: source "Toshino Powerbar 4Sockets 3M" vs candidate "Toshino Powerbar 4Sockets 3M.".

Blocked: Expected exactly one strict identity match; found 0.

### IN-LA-PCL0010

Source model: `a7118edd-0e55-4742-82f7-15d77c5ae465`. Base identity: {"name":"AMC-3682","brand":"Commscope","partNo":"1859247-7","modelNo":null,"description":"Patch Cord CAT6 RJ45-RJ45(B) 7Ft, 2.14M. (AM-3662) (Used)"}.

Candidate `e039d924-f102-4d2e-8e1e-c97b38d80744`: name: source "AMC-3682" vs candidate "AMC-3662".

Candidate `f5ab5f13-8e21-4a7a-a922-d001ea0e96a2`: part_no: source "1859247-7" vs candidate "1859249-7"; description: source "Patch Cord CAT6 RJ45-RJ45(B) 7Ft, 2.14M. (AM-3662)" vs candidate "Patch Cord CAT6 RJ45-RJ45(B) 7Ft, 2.14M. (AM-3682)".

Blocked: Expected exactly one strict identity match; found 0.

### SS-AD-ADP0003

Source model: `d9fa91ac-3c5c-48bf-bbd3-57c13c81135c`. Base identity: {"name":"DP-TO-VGA-Adapter","brand":"Magelei","partNo":null,"modelNo":null,"description":"Displayport to VGA Convertor (Used)"}.

No same-warehouse base-name/description candidate exists. A product identifier match alone is not accepted.
Blocked: Missing brand or strong product identifier (part/model number); Expected exactly one strict identity match; found 0.

## Verification

The database snapshot revision changed during inspection while the 23 proposed mappings, 15 blocked mappings, asset IDs, stock codes and quantities stayed identical. The revision above is from the final read-only report. Any future apply must generate a fresh revision and obtain fresh approval; this report is not live authorization.

Read-only information_schema inspection confirmed asset_status_histories has previous_quantity, new_quantity, quantity_before, quantity_after, quantity_changed and condition. The separately owned, deployed stockCode migration adds the scalar stock_code field; normalization now records the preserved stock code both in that scalar and in the JSON note. No normalization-owned migration is required.

Focused library/CLI typecheck passed. Repo-wide typecheck fails in existing shared import/transaction/workflow files outside this task's ownership. Apply was never run against the live database; transaction-path tests use mocks.

## Posted History And Workflow Boundary

Records with already posted histories do not recalculate or replay any quantity movement. Normalization uses the current asset_quantity unchanged, never derives stock from old history or requested quantities, and appends only a metadata audit with quantityBefore=quantityAfter=current quantity and quantityChanged=0. Existing histories are never updated or deleted.

Master reparenting preserves the original asset ID and stock code. No historical transaction item field is reparented: assetId, assetModelId, quantities, statuses, resolution fields and timestamps remain untouched. The CLI does not update transaction_items at all, including unposted items. It does not migrate or repost completed workflows.

Only outstanding workflows are eligible for any separately owned workflow migration. This normalization script does not perform that migration: unresolved item/model references, reservations and locks block a pair until the main workflow owner handles them and a new dry-run is reviewed. Any separately implemented item reparenting must be restricted to unposted items and must not modify posted history.

## Decision Required

The 23 strict proposals are not automatically approved. A reviewer must explicitly approve a selected subset in mapping JSON, provide an existing audit actor UUID and reason, and use a fresh post-migration database revision. The revision and example above document the earlier inspection and must not be treated as current approval after schema/data changes.

Keep all 15 blocked cases unmapped pending evidence-based identity review. Do not approve related-name hints or choose an arbitrary target. Resolve outstanding workflows separately, preserve historical item/model references, then regenerate and reapprove the normalization mapping. No live apply has been executed or authorized by this report.


