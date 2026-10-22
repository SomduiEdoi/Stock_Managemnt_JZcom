export const organizationPositions = [
  { tag: "SERVICE_MANAGER", team: "SERVICE", level: "MANAGER", label: "Service Manager", nextApproverRole: null },
  { tag: "SOLUTION_ASST_MANAGER", team: "SOLUTION", level: "MANAGER", label: "Solution Asst. Manager", nextApproverRole: "SERVICE_MANAGER" },
  { tag: "SYSTEM_ENGINEER", team: "SYSTEM", level: "SUPERVISOR", label: "System Engineer", nextApproverRole: "SOLUTION_ASST_MANAGER" },
  { tag: "SYSTEM_HELP_DESK", team: "SYSTEM", level: "STAFF", label: "System Help Desk", nextApproverRole: "SYSTEM_ENGINEER" },
  { tag: "NETWORK_ENGINEER", team: "NETWORK", level: "SUPERVISOR", label: "Network Engineer", nextApproverRole: "SOLUTION_ASST_MANAGER" },
  { tag: "NETWORK_HELP_DESK", team: "NETWORK", level: "STAFF", label: "Network Help Desk", nextApproverRole: "NETWORK_ENGINEER" },
  { tag: "CLOUD_ENGINEER", team: "CLOUD", level: "SUPERVISOR", label: "Cloud Engineer", nextApproverRole: "SOLUTION_ASST_MANAGER" },
  { tag: "CLOUD_HELP_DESK", team: "CLOUD", level: "STAFF", label: "Cloud Help Desk", nextApproverRole: "CLOUD_ENGINEER" },
  { tag: "CUSTOMER_SERVICE_ENGINEER", team: "CUSTOMER_SERVICE", level: "SUPERVISOR", label: "Customer Service Engineer", nextApproverRole: "SERVICE_MANAGER" },
  { tag: "CMS_ASST_ENGINEER", team: "CMS", level: "SUPERVISOR", label: "CMS Asst. Engineer", nextApproverRole: "CUSTOMER_SERVICE_ENGINEER" },
  { tag: "CMS_HELP_DESK", team: "CMS", level: "STAFF", label: "CMS Help Desk", nextApproverRole: "CMS_ASST_ENGINEER" },
  { tag: "SERVICE_DESK_ASST_ENGINEER", team: "SD", level: "SUPERVISOR", label: "Service Desk Asst. Engineer", nextApproverRole: "CUSTOMER_SERVICE_ENGINEER" },
  { tag: "SERVICE_DESK_1_HELP_DESK", team: "SD1", level: "STAFF", label: "Service Desk 1 Help Desk", nextApproverRole: "SERVICE_DESK_ASST_ENGINEER" },
  { tag: "SERVICE_DESK_2_HELP_DESK", team: "SD2", level: "STAFF", label: "Service Desk 2 Help Desk", nextApproverRole: "SERVICE_DESK_ASST_ENGINEER" },
  { tag: "DELIVERY_CLIENT_MANAGER", team: "DL", level: "MANAGER", label: "Delivery & Client Manager", nextApproverRole: null },
  { tag: "DELIVERY_CLIENT_HELP_DESK", team: "DL", level: "STAFF", label: "Delivery & Client Help Desk", nextApproverRole: "DELIVERY_CLIENT_MANAGER" },
  { tag: "BSD_HELP_DESK", team: "BSD", level: "STAFF", label: "BSD Help Desk", nextApproverRole: null },
  { tag: "WAREHOUSE_MANAGER", team: "WAREHOUSE", level: "MANAGER", label: "Warehouse Manager", nextApproverRole: null },
] as const;

export function organizationPosition(tag: string) {
  return organizationPositions.find((position) => position.tag === tag);
}
