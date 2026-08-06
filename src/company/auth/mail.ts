/**
 * Optional SMTP for OTP (M1b). When OMC_SMTP_URL unset, OTP stays in API response as devCode.
 */
import nodemailer from "nodemailer";

export interface OtpMailResult {
  sent: boolean;
  transport: "smtp" | "dev";
  detail?: string;
}

export async function sendOtpEmail(input: {
  to: string;
  code: string;
  orgId?: string;
}): Promise<OtpMailResult> {
  const smtpUrl = process.env.OMC_SMTP_URL?.trim();
  const from = process.env.OMC_SMTP_FROM?.trim() || "noreply@onmycompany.local";
  if (!smtpUrl) {
    return { sent: false, transport: "dev", detail: "OMC_SMTP_URL not set; use devCode" };
  }
  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from,
      to: input.to,
      subject: `[OnMyCompany] Login code ${input.code}`,
      text: [
        `Your OnMyCompany login code is: ${input.code}`,
        "",
        `Org: ${input.orgId ?? "default"}`,
        "This code expires in 15 minutes.",
      ].join("\n"),
    });
    return { sent: true, transport: "smtp" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { sent: false, transport: "smtp", detail: message };
  }
}
