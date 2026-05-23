import nodemailer from "nodemailer";
import { serverEnv } from "./env.server";

export interface SendMailInput {
  to: string | string[];
  subject: string;
  htmlBody: string;
  plainBody?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    base64: string;
  }>;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function getTransporter() {
  if (!serverEnv.EMAIL_USER || !serverEnv.EMAIL_PASS) {
    throw new Error("EMAIL_USER or EMAIL_PASS is not configured");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: serverEnv.EMAIL_USER,
      pass: serverEnv.EMAIL_PASS,
    },
  });
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!serverEnv.EMAIL_USER || !serverEnv.EMAIL_PASS) {
    return { ok: false, error: "EMAIL_USER or EMAIL_PASS is not configured" };
  }

  const fromName = serverEnv.EMAIL_FROM_NAME ?? "Saadaa";
  const from = `"${fromName}" <${serverEnv.EMAIL_USER}>`;

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
    subject: input.subject,
    html: input.htmlBody,
    text: input.plainBody,
  };

  if (input.cc) {
    mailOptions.cc = Array.isArray(input.cc) ? input.cc.join(", ") : input.cc;
  }
  if (input.bcc) {
    mailOptions.bcc = Array.isArray(input.bcc) ? input.bcc.join(", ") : input.bcc;
  }
  if (input.replyTo) {
    mailOptions.replyTo = input.replyTo;
  }

  if (input.attachments?.length) {
    mailOptions.attachments = input.attachments.map((att) => ({
      filename: att.fileName,
      content: Buffer.from(att.base64, "base64"),
      contentType: att.mimeType,
    }));
  }

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
