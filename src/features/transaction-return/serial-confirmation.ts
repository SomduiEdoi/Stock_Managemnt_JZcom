export function canConfirmIssueSerial(input: {
  workflowStatus: string;
  type: string;
  sourceTransactionId: string | null;
  hasOutcomes: boolean;
  approvalTag: string | null;
  warehouseCode: string;
  isSerialized: boolean;
  assetStatus: string;
  serialNo: string | null;
  isDispatched: boolean;
}) {
  return input.workflowStatus === "PENDING" &&
    (input.type === "BORROW" || input.type === "USING" || input.type === "SOLD") &&
    !input.sourceTransactionId && !input.hasOutcomes &&
    input.approvalTag === `STOREMAN:${input.warehouseCode}` &&
    input.isSerialized && input.assetStatus === "REQUEST" &&
    Boolean(input.serialNo) && !input.isDispatched;
}
