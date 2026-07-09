import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { DomainPermission, RoleCode } from "@/lib/permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type CurrentUser = {
  azureAdObjectId: string | null;
  id: string;
  email: string;
  lastLoginAt: Date | null;
  name: string;
  organizationLevel: string | null;
  organizationTag: string | null;
  projectTag: string | null;
  position: string | null;
  signatureDataUrl: string | null;
  signatureUploadedAt: Date | null;
  signatureUploadedBy: { email: string; name: string } | null;
  roles: RoleCode[];
  permissions: DomainPermission[];
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
      projectTag: true,
      position: true,
      signatureDataUrl: true,
      signatureUploadedAt: true,
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
      domainPermissions: {
        select: {
          canManage: true,
          canView: true,
          domain: {
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
  return {
    azureAdObjectId: user.azureAdObjectId,
    id: user.id,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: user.organizationLevel,
    organizationTag: user.organizationTag,
    projectTag: user.projectTag,
    position: user.position,
    signatureDataUrl: user.signatureDataUrl,
    signatureUploadedAt: user.signatureUploadedAt,
    signatureUploadedBy: user.signatureUploadedBy,
    roles: user.roles.map(({ role }) => role.code as RoleCode),
    permissions: user.domainPermissions.map((permission) => ({
      canManage: permission.canManage,
      canView: permission.canView,
      domainCode: permission.domain.code,
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
