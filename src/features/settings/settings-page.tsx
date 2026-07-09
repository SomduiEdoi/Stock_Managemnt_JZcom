import Image from "next/image";
import type { CurrentUser } from "@/lib/auth";
import { SignatureUploadButton } from "./signature-upload-button";

type SettingsPageProps = {
  user: CurrentUser;
};

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

function roleLabel(role: string) {
  if (role === "ADMIN") {
    return "Administrator";
  }

  if (role === "STOCK_CONTROLLER") {
    return "Stock Controller";
  }

  return "User";
}

function formatTag(value: string | null) {
  return value ? value.replaceAll("_", " ") : "-";
}

function userTag(user: CurrentUser) {
  const tags = [
    user.organizationLevel ? formatTag(user.organizationLevel) : null,
    user.organizationTag ? formatTag(user.organizationTag) : null,
    user.projectTag ? formatTag(user.projectTag) : null,
  ].filter(Boolean);

  return tags.length > 0 ? tags.join(" / ") : "-";
}

function domainLabel(domainCode: string) {
  if (domainCode === "SERVER") {
    return "Server";
  }

  if (domainCode === "NETWORK") {
    return "Network";
  }

  return domainCode;
}

function domainAccess(user: CurrentUser) {
  if (user.roles.includes("ADMIN")) {
    return "All domains";
  }

  const domains = user.permissions.map((permission) =>
    `${domainLabel(permission.domainCode)} ${permission.canManage ? "Manage" : "View"}`,
  );

  return domains.length > 0 ? domains.join(", ") : "-";
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 text-[15px] leading-7">
      <dt className="w-28 shrink-0 font-bold text-ink">{label}:</dt>
      <dd className="min-w-0 break-words font-semibold text-ink">{value}</dd>
    </div>
  );
}

function TagValue({ children, tone = "blue" }: { children: string; tone?: "blue" | "red" }) {
  const toneClass =
    tone === "red"
      ? "bg-status-fail/15 text-status-fail"
      : "bg-status-borrow/15 text-navy";

  return (
    <span className={`inline-flex rounded-md px-3 py-1 text-sm font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

export function SettingsPage({ user }: SettingsPageProps) {
  const hasSignature = Boolean(user.signatureDataUrl);

  return (
    <div className="mx-auto max-w-7xl">
      <article className="min-h-[640px] rounded-md bg-white px-10 py-9 shadow-sm">
        <div className="inline-flex flex-col items-center">
          <h1 className="text-lg font-bold text-[#00796B]">Profile</h1>
          <span className="mt-2 h-1 w-28 rounded-full bg-[#A6C437]" />
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] xl:grid-cols-[260px_1fr]">
          <aside className="flex justify-center lg:justify-start">
            <div className="flex h-40 w-40 items-center justify-center rounded-full border-2 border-[#00796B] bg-navy text-4xl font-bold text-white">
              {getInitials(user.name)}
            </div>
          </aside>

          <section className="max-w-3xl">
            <dl className="space-y-3">
              <ProfileRow label="Name" value={user.name} />
              <ProfileRow label="Email" value={user.email} />
              <ProfileRow label="Phone" value="-" />
              <div className="flex items-start gap-3 text-[15px] leading-7">
                <dt className="w-28 shrink-0 font-bold text-ink">Role:</dt>
                <dd className="flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <TagValue key={role} tone={role === "ADMIN" ? "red" : "blue"}>
                      {roleLabel(role)}
                    </TagValue>
                  ))}
                </dd>
              </div>
              <div className="flex items-start gap-3 text-[15px] leading-7">
                <dt className="w-28 shrink-0 font-bold text-ink">Tag:</dt>
                <dd>
                  <TagValue>{userTag(user)}</TagValue>
                </dd>
              </div>
              <ProfileRow label="Domain" value={domainAccess(user)} />
            </dl>

            <div className="mt-9">
              <p className="text-[15px] font-semibold text-ink">
                Electronic Signature
              </p>
              <div className="mt-4 flex flex-col items-start gap-4">
                <div className="flex h-28 w-44 items-center justify-center border border-dashed border-border bg-white">
                  {user.signatureDataUrl ? (
                    <Image
                      alt="Electronic signature"
                      className="max-h-24 max-w-[160px] object-contain"
                      height={96}
                      src={user.signatureDataUrl}
                      unoptimized
                      width={160}
                    />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      No signature
                    </span>
                  )}
                </div>
                <SignatureUploadButton hasSignature={hasSignature} />
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
