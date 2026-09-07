import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { WarehousePermission, RoleCode } from "@/lib/permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type CurrentUser = {
  azureAdObjectId: string | null;
  id: string;
  email: string;
  lastLoginAt: Date | null;
  name: string;
  organizationLevel: string | null;
  organizationTag: string | null;
  organizationAssignments: Array<{
    id: string;
    isPrimary: boolean;
    organizationLevel: string;
    organizationTag: string;
  }>;
  projectTag: string | null;
  position: string | null;
  signatureDataUrl: string | null;
  signatureUploadedAt: Date | null;
  signatureUploadedBy: { email: string; name: string } | null;
  stockControllerTag: string | null;
  roles: RoleCode[];
  permissions: WarehousePermission[];
};

async function findActiveUser(userId: string) {
  return db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      azureAdObjectId: true,
      id: true,
      email: true,
      lastLoginAt: true,
      name: true,
      organizationLevel: true,
      organizationTag: true,
      organizationAssignments: {
        orderBy: [{ isPrimary: "desc" }, { organizationTag: "asc" }],
        select: {
          id: true,
          isPrimary: true,
          organizationLevel: true,
          organizationTag: true,
        },
        where: { isActive: true },
      },
      projectTag: true,
      position: true,
      signatureDataUrl: true,
      signatureUploadedAt: true,
      stockControllerTag: true,
      signatureUploadedBy: {
        select: {
          email: true,
          name: true,
        },
      },
      roles: {
        select: {
          role: {
            select: {
              code: true,
            },
          },
        },
      },
      warehousePermissions: {
        where: { warehouse: { isActive: true } },
        select: {
          canManage: true,
          canView: true,
          warehouse: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });
}

function toCurrentUser(
  user: NonNullable<Awaited<ReturnType<typeof findActiveUser>>>,
): CurrentUser {
  const primaryAssignment = user.organizationAssignments.find(
    (assignment) => assignment.isPrimary,
  ) ?? user.organizationAssignments[0];

  return {
    azureAdObjectId: user.azureAdObjectId,
    id: user.id,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: primaryAssignment?.organizationLevel ?? user.organizationLevel,
    organizationTag: primaryAssignment?.organizationTag ?? user.organizationTag,
    organizationAssignments: user.organizationAssignments,
    projectTag: user.projectTag,
    position: user.position,
    signatureDataUrl: user.signatureDataUrl,
    signatureUploadedAt: user.signatureUploadedAt,
    signatureUploadedBy: user.signatureUploadedBy,
    stockControllerTag: user.stockControllerTag,
    roles: user.roles.map(({ role }) => role.code as RoleCode),
    permissions: user.warehousePermissions.map((permission) => ({
      canManage: permission.canManage,
      canView: permission.canView,
      warehouseCode: permission.warehouse.code,
    })),
  };
}

export async function getUserFromSessionToken(token: string | undefined) {
  const session = verifySessionToken(token);

  if (!session) {
    return null;
  }

  const user = await findActiveUser(session.userId);

  return user ? toCurrentUser(user) : null;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getUserFromSessionToken(token);
}

export async function requireCurrentUser(nextPath = "/dashboard") {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

