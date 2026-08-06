import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { CircleAlert, Inbox, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import providerIconUrls from "virtual:oomol-provider-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Metric(props: { label: string; value: number }): ReactNode {
  return (
    <Card className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </Card>
  );
}

export function InfoBlock(props: { icon: ReactNode; label: string; value: string }): ReactNode {
  return (
    <div className="info-block">
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Badge(props: { children: ReactNode; tone?: "success" | "warning" | "error" }): ReactNode {
  return (
    <UiBadge
      variant={props.tone === "error" ? "destructive" : "outline"}
      className={props.tone ? `badge ${props.tone}` : "badge"}
    >
      {props.children}
    </UiBadge>
  );
}

export function TagList(props: { values: string[]; empty: string }): ReactNode {
  const values = props.values.filter(Boolean);
  if (values.length === 0) return <p className="muted-copy">{props.empty}</p>;
  return (
    <div className="tag-list">
      {values.map((value) => (
        <span key={value} className="tag">
          {value}
        </span>
      ))}
    </div>
  );
}

export function ProviderIcon(props: { provider: ProviderDefinition; large?: boolean }): ReactNode {
  const letters = providerInitials(props.provider.displayName);
  const iconSource = providerIconSource(props.provider);
  const [failedIconSource, setFailedIconSource] = useState<string | null>(null);
  const className = props.large ? "provider-icon large" : "provider-icon";

  if (!iconSource || failedIconSource === iconSource.value) {
    return <span className={className}>{letters}</span>;
  }

  return (
    <span className={className}>
      <img
        alt=""
        className="provider-icon-image"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={iconSource.value}
        onError={() => setFailedIconSource(iconSource.value)}
      />
    </span>
  );
}

export function providerInitials(displayName: string): string {
  return (
    displayName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function providerIconUrl(provider: ProviderDefinition): string | undefined {
  const source = providerIconSource(provider);
  return source?.kind == "url" ? source.value : undefined;
}

interface ProviderIconSource {
  kind: "url";
  value: string;
}

export function providerIconSource(
  provider: ProviderDefinition,
  catalogIconUrls: Readonly<Record<string, string>> = providerIconUrls,
): ProviderIconSource | undefined {
  const iconUrl = provider.iconUrl?.trim();
  if (iconUrl) {
    return { kind: "url", value: iconUrl };
  }

  const catalogIconUrl = catalogIconUrls[provider.service]?.trim();
  if (catalogIconUrl) {
    return { kind: "url", value: catalogIconUrl };
  }

  const hostname = providerHomepageHostname(provider.homepageUrl);
  return hostname
    ? { kind: "url", value: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}` }
    : undefined;
}

function providerHomepageHostname(homepageUrl: string | undefined): string | undefined {
  if (!homepageUrl) {
    return undefined;
  }

  try {
    return new URL(homepageUrl).hostname;
  } catch {
    return undefined;
  }
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode | null;
  density?: "regular" | "compact";
  tone?: "neutral" | "success";
}

export function EmptyState(props: EmptyStateProps): ReactNode {
  const icon = props.icon === undefined ? <Inbox size={20} /> : props.icon;
  const className = [
    "empty-state",
    props.density === "compact" ? "compact" : undefined,
    props.tone === "success" ? "success" : undefined,
    icon == null ? "no-icon" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {icon}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </div>
  );
}

export function InlineError(props: { message: string }): ReactNode {
  return (
    <Alert variant="destructive" className="inline-error">
      <CircleAlert size={16} />
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

export function FormStatus(props: { message: string }): ReactNode {
  return (
    <Alert className="status-alert" role="status">
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

export function StatusDot(props: { ok: boolean }): ReactNode {
  return <span className={props.ok ? "status-dot ok" : "status-dot error"} />;
}

export type ConsoleModalSize = "sm" | "md" | "lg" | "xl";

/**
 * Shared centered modal for console forms (team / skills / etc.).
 * Prefer this over ad-hoc overlays so head/body/foot spacing stays consistent.
 */
export function ConsoleModal(props: {
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ConsoleModalSize;
  /** Extra class on the panel (e.g. skills-modal for wide list layouts). */
  className?: string;
}): ReactNode {
  const titleId = useId();
  const size = props.size ?? "md";

  const onClose = props.onClose;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="console-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={props.onClose}
    >
      <div
        className={["console-modal", `console-modal-${size}`, props.className].filter(Boolean).join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="console-modal-head">
          <div className="console-modal-head-text">
            <h2 id={titleId} className="console-modal-title">
              {props.title}
            </h2>
            {props.description ? <p className="console-modal-desc">{props.description}</p> : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="console-modal-close"
            onClick={props.onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="console-modal-body">{props.children}</div>
        {props.footer ? <div className="console-modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}
