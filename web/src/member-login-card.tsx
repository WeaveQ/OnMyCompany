import type { ReactNode } from "react";

import { InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MemberLoginCardProps {
  title?: string;
  description?: string;
  email: string;
  code: string;
  loading?: boolean;
  error?: string | null;
  onEmailChange(value: string): void;
  onCodeChange(value: string): void;
  onSubmit(): void;
}

/**
 * Shared enterprise member login card (OTP / dev code).
 * Keeps Skills / Team / OrgConfig login UX consistent.
 */
export function MemberLoginCard(props: MemberLoginCardProps): ReactNode {
  return (
    <div className="console-card member-login-card" data-testid="member-login-card">
      <h2 className="member-login-title">{props.title ?? "登录企业成员"}</h2>
      <p className="member-login-desc">
        {props.description ?? "使用组织邮箱登录。本地开发可用固定 OTP 000000（无需邮件服务）。"}
      </p>
      <div className="member-login-fields">
        <Label className="field">
          <span>工作邮箱</span>
          <Input
            value={props.email}
            onChange={(e) => props.onEmailChange(e.target.value)}
            autoComplete="username"
            data-testid="member-login-email"
          />
        </Label>
        <Label className="field">
          <span>验证码</span>
          <Input
            value={props.code}
            onChange={(e) => props.onCodeChange(e.target.value)}
            autoComplete="one-time-code"
            data-testid="member-login-code"
          />
        </Label>
      </div>
      <Button
        disabled={props.loading || !props.email.trim()}
        onClick={() => props.onSubmit()}
        data-testid="member-login-submit"
      >
        登录
      </Button>
      {props.error ? <InlineError message={props.error} /> : null}
    </div>
  );
}
